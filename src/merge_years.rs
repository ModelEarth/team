// Stage 2 of PLAN-merge.md: merging per-year Industry Databases
// (industrydb_2019, industrydb_2021, and future industrydb_{year}) into
// the shared, multi-year `industrydb` (EXIOBASE_NAME itself — not a
// per-year database). Two ways in:
//
// 1. **`dblink`-based merge** of an already-loaded per-year database —
//    `POST /api/db/merge-years/inspect` (read-only dry-run) and
//    `POST /api/db/merge-years/run` (the real merge). Data movement happens
//    entirely inside Azure Postgres; row data never round-trips through
//    this Rust process. **Currently blocked** — see PLAN-merge.md and
//    pipeline/README.md — `dblink` isn't allow-listed on the Azure server
//    yet, so `ensure_merge_infra` fails before either procedure exists.
// 2. **Direct import**, bypassing the per-year database and the `dblink`
//    step entirely: `POST /api/db/insert-trade-data` with
//    `{"target": "industrydb"}` fetches the same year's CSVs from GitHub
//    (same as the normal per-year loader) but inserts straight into the
//    shared `industrydb`, adding the `year` column and remapping
//    `factor_id` through `industrydb`'s own `factor` table as it goes —
//    the same logic `merge_exiobase_year` would apply, just done in Rust
//    instead of via `dblink`. Works today; no Azure change needed.
//
// Direct import reuses the same insert_trade_rows/insert_trade_factor_rows/
// insert_interstate_*_rows functions the per-year loader uses (in
// main.rs) — they take an `Option<i32>` year (None there, Some(y) here)
// and, for the two factor tables, an optional factor_id remap map, rather
// than this module keeping its own duplicate copies of that CSV-parsing
// logic.

use actix_web::{web, HttpResponse, Result};
use serde::Deserialize;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use std::sync::Arc;

use crate::{
    connect_to_exiobase_year, ensure_database_exists, fetch_github_csv, get_or_assign_country_block,
    init_industry_tables_in_pool, insert_interstate_factor_rows,
    insert_interstate_rows, insert_trade_factor_rows, insert_trade_rows, parse_factor_csv, try_exec,
    upsert_factor_rows, upsert_industry_rows, upsert_sector_industry_rows, upsert_sector_rows,
    year_database_name, ApiState,
};

#[derive(Deserialize)]
pub struct MergeYearRequest {
    pub year: String,
}

fn parse_year(raw: &str) -> Result<i32, String> {
    let year = raw.trim();
    if year.len() != 4 || !year.chars().all(|c| c.is_ascii_digit()) {
        return Err("Invalid year".to_string());
    }
    year.parse::<i32>().map_err(|_| "Invalid year".to_string())
}

// Connects to the shared EXIOBASE_NAME database ("industrydb"), creating it
// first if it doesn't exist yet (it's just another Azure Postgres database
// on the same server as the per-year ones — see ensure_database_exists).
async fn connect_to_industrydb() -> Result<Pool<Postgres>, String> {
    let name = std::env::var("EXIOBASE_NAME").unwrap_or_default();
    if name.is_empty() {
        return Err("Industry Database not configured — set EXIOBASE_NAME".to_string());
    }
    ensure_database_exists(&name).await?;

    let host = std::env::var("EXIOBASE_HOST").unwrap_or_default();
    let user = std::env::var("EXIOBASE_USER").unwrap_or_default();
    let password = std::env::var("EXIOBASE_PASSWORD").unwrap_or_default();
    let port = std::env::var("EXIOBASE_PORT").unwrap_or_else(|_| "5432".to_string());
    let ssl_mode = std::env::var("EXIOBASE_SSL_MODE").unwrap_or_else(|_| "require".to_string());
    if host.is_empty() || user.is_empty() || password.is_empty() {
        return Err("Industry Database not configured — set EXIOBASE_* environment variables".to_string());
    }
    let url = format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}");

    sqlx::postgres::PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .map_err(|e| format!("Failed to connect to industrydb: {e}"))
}

// Builds the libpq keyword=value conninfo string `dblink` needs to reach
// one year's per-year database from *inside* Postgres — not a postgres://
// URL (dblink doesn't parse those). Built fresh per call from the regular
// EXIOBASE_* credentials rather than stored anywhere, per PLAN-merge.md's
// "ad-hoc connection string per call" design.
fn year_conninfo(year: &str) -> Result<String, String> {
    let db_name = year_database_name(year)?;
    let host = std::env::var("EXIOBASE_HOST").unwrap_or_default();
    let user = std::env::var("EXIOBASE_USER").unwrap_or_default();
    let password = std::env::var("EXIOBASE_PASSWORD").unwrap_or_default();
    let port = std::env::var("EXIOBASE_PORT").unwrap_or_else(|_| "5432".to_string());
    let ssl_mode = std::env::var("EXIOBASE_SSL_MODE").unwrap_or_else(|_| "require".to_string());
    if host.is_empty() || user.is_empty() || password.is_empty() {
        return Err("Industry Database not configured — set EXIOBASE_* environment variables".to_string());
    }
    Ok(format!(
        "host={host} port={port} dbname={db_name} user={user} password={password} sslmode={ssl_mode}"
    ))
}

// Idempotent: ensures industrydb's shared schema and the two merge
// procedures exist. Run before every inspect/run call rather than once at
// startup — same pattern init_industry_tables_in_pool already uses for the
// per-year databases.
async fn ensure_merge_infra(pool: &Pool<Postgres>) -> Result<(), String> {
    let mut steps: Vec<String> = Vec::new();
    try_exec(pool, "CREATE EXTENSION IF NOT EXISTS dblink", &mut steps).await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS industry (
            industry_id VARCHAR(10) NOT NULL PRIMARY KEY,
            name        TEXT        NOT NULL,
            category    VARCHAR(100)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS sector (
            sector_id VARCHAR(10) NOT NULL PRIMARY KEY,
            name      TEXT        NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS sector_industry (
            sector_id   VARCHAR(10)   NOT NULL,
            industry_id VARCHAR(10)   NOT NULL,
            weight      NUMERIC(10,6) NOT NULL,
            PRIMARY KEY (sector_id, industry_id),
            CONSTRAINT fk_si_sector FOREIGN KEY (sector_id) REFERENCES sector(sector_id),
            CONSTRAINT fk_si_industry FOREIGN KEY (industry_id) REFERENCES industry(industry_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // UNIQUE(extension, stressor): the real Exiobase-sourced identity of a
    // factor row (see PLAN-merge.md's "factor table" section) — merges
    // match an incoming year's factor rows against this, not against raw
    // factor_id, since factor_id is only our own pipeline's row-position
    // assignment and isn't guaranteed stable across years forever.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS factor (
            factor_id SMALLINT NOT NULL PRIMARY KEY,
            extension VARCHAR(100),
            stressor  TEXT,
            unit      VARCHAR(50),
            CONSTRAINT factor_extension_stressor_key UNIQUE (extension, stressor)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // region — Part 1 of PLAN-merge.md's multi-country fix, same table/logic
    // as the per-year databases' (see init_industry_tables_in_pool in
    // main.rs): one block_index per country, shared across every year merged
    // into this database (block_index depends only on country, never on
    // year — trade_id's PK here is (year, trade_id), so distinct years never
    // need distinct blocks for the same country; only countries sharing the
    // same year ever need to avoid colliding, and distinct block_indexes
    // already guarantee that). Indices start at 1 — see
    // get_or_assign_country_block in main.rs.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS region (
            country     VARCHAR(10) NOT NULL PRIMARY KEY,
            block_index SMALLINT    NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    try_exec(pool, "ALTER TABLE region ADD COLUMN IF NOT EXISTS name VARCHAR(100)", &mut steps).await;
    try_exec(pool, "ALTER TABLE region ALTER COLUMN block_index TYPE SMALLINT", &mut steps).await;

    // trade/trade_factor/interstate/interstate_factor:
    // year added to the PK on top of Stage 1's per-year trade_id/
    // interstate_id (see PLAN-merge.md's two-stage ID design) — Stage 1
    // already made those unique *within* one year; year makes them unique
    // *across* years too, with no arithmetic relationship between the two.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trade (
            year       SMALLINT      NOT NULL,
            trade_id   INTEGER       NOT NULL,
            region1    VARCHAR(10)   NOT NULL,
            region2    VARCHAR(10)   NOT NULL,
            industry1  VARCHAR(10)   NOT NULL,
            industry2  VARCHAR(10)   NOT NULL,
            amount     NUMERIC(18,4),
            flow_type  VARCHAR(20)   NOT NULL DEFAULT 'unknown',
            country    VARCHAR(10)   NOT NULL DEFAULT 'unknown',
            PRIMARY KEY (year, trade_id),
            CONSTRAINT trade_natural_key UNIQUE (year, region1, region2, industry1, industry2),
            CONSTRAINT fk_trade_industry1 FOREIGN KEY (industry1) REFERENCES industry(industry_id),
            CONSTRAINT fk_trade_industry2 FOREIGN KEY (industry2) REFERENCES industry(industry_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // trade.country -> region.country: added as a separate ALTER, not
    // inlined into the CREATE TABLE above, since that CREATE TABLE
    // IF NOT EXISTS is a no-op against the trade table that already exists
    // here from the 2019/2021 direct-import merges — an inline CONSTRAINT
    // would never actually apply to it. Expected to SKIP the first time
    // this runs (existing 'US' trade rows predate the region table), then
    // self-heal on a later call once region has a 'US' row (same pattern as
    // main.rs's per-year databases).
    try_exec(
        pool,
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_trade_region') THEN ALTER TABLE trade ADD CONSTRAINT fk_trade_region FOREIGN KEY (country) REFERENCES region(country); END IF; END $$",
        &mut steps,
    )
    .await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trade_factor (
            year        SMALLINT     NOT NULL,
            trade_id    INTEGER      NOT NULL,
            country     VARCHAR(10)  NOT NULL,
            flow_type   VARCHAR(20)  NOT NULL,
            factor_id   SMALLINT     NOT NULL,
            coefficient NUMERIC(20,10),
            level       NUMERIC(20,6),
            PRIMARY KEY (year, trade_id, factor_id),
            CONSTRAINT fk_tf_trade FOREIGN KEY (year, trade_id) REFERENCES trade(year, trade_id),
            CONSTRAINT fk_tf_factor FOREIGN KEY (factor_id) REFERENCES factor(factor_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Widens a pre-existing trade/trade_factor from VARCHAR(10) (safe no-op
    // once already widened) -- comprehensive mode's two-way domestic/
    // international split needs 13 chars, wider than the curated pipeline's
    // domestic/imports/exports values that originally sized this column.
    try_exec(pool, "ALTER TABLE trade ALTER COLUMN flow_type TYPE VARCHAR(20)", &mut steps).await;
    try_exec(pool, "ALTER TABLE trade_factor ALTER COLUMN flow_type TYPE VARCHAR(20)", &mut steps).await;

    // Narrows factor_id from INTEGER to SMALLINT (safe no-op once already
    // narrowed) -- factor has under 1,000 rows (728 as of 2018's Exiobase
    // extraction), well within SMALLINT's +/-32,767 range versus INTEGER's
    // 4 bytes. fk_tf_factor is dropped first and re-added after: unlike
    // main.rs's year-database schema (which adds this FK via a separate
    // idempotent block later), this table declares it inline in CREATE
    // TABLE, so on an already-initialized database (where CREATE TABLE IF
    // NOT EXISTS is a no-op) it has to be re-added explicitly here.
    // interstate_factor's fk_isf_factor is handled the same way further
    // down, right after its own factor_id column is narrowed.
    try_exec(pool, "ALTER TABLE trade_factor DROP CONSTRAINT IF EXISTS fk_tf_factor", &mut steps).await;
    try_exec(pool, "ALTER TABLE factor ALTER COLUMN factor_id TYPE SMALLINT", &mut steps).await;
    try_exec(pool, "ALTER TABLE trade_factor ALTER COLUMN factor_id TYPE SMALLINT", &mut steps).await;
    try_exec(pool, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_tf_factor') THEN ALTER TABLE trade_factor ADD CONSTRAINT fk_tf_factor FOREIGN KEY (factor_id) REFERENCES factor(factor_id); END IF; END $$", &mut steps).await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS interstate (
            year                 SMALLINT      NOT NULL,
            interstate_id        INTEGER       NOT NULL,
            trade_id             INTEGER       NOT NULL,
            country              VARCHAR(2)    NOT NULL DEFAULT 'US',
            state1               VARCHAR(10)   NOT NULL,
            state2               VARCHAR(10)   NOT NULL,
            sector1              VARCHAR(10),
            sector2              VARCHAR(10),
            state_industry_code  VARCHAR(30),
            amount               NUMERIC(18,4),
            commodity_code       VARCHAR(30),
            industry_code        VARCHAR(30),
            economic_multiplier  NUMERIC(10,6),
            PRIMARY KEY (year, interstate_id),
            CONSTRAINT fk_istate_trade FOREIGN KEY (year, trade_id) REFERENCES trade(year, trade_id),
            CONSTRAINT fk_istate_sector1 FOREIGN KEY (sector1) REFERENCES sector(sector_id),
            CONSTRAINT fk_istate_sector2 FOREIGN KEY (sector2) REFERENCES sector(sector_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS interstate_factor (
            year          SMALLINT NOT NULL,
            interstate_id INTEGER  NOT NULL,
            factor_id     SMALLINT NOT NULL,
            level         NUMERIC(20,6),
            flow_type     VARCHAR(20),
            PRIMARY KEY (year, interstate_id, factor_id),
            CONSTRAINT fk_isf_interstate FOREIGN KEY (year, interstate_id) REFERENCES interstate(year, interstate_id),
            CONSTRAINT fk_isf_factor FOREIGN KEY (factor_id) REFERENCES factor(factor_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Same factor_id narrowing as trade_factor above -- see that comment.
    try_exec(pool, "ALTER TABLE interstate_factor DROP CONSTRAINT IF EXISTS fk_isf_factor", &mut steps).await;
    try_exec(pool, "ALTER TABLE interstate_factor ALTER COLUMN factor_id TYPE SMALLINT", &mut steps).await;
    try_exec(pool, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_isf_factor') THEN ALTER TABLE interstate_factor ADD CONSTRAINT fk_isf_factor FOREIGN KEY (factor_id) REFERENCES factor(factor_id); END IF; END $$", &mut steps).await;

    // interstate_estimate is retired -- it held one row per interstate flow
    // with no satellite factor data available (bea/main.py's no-satellite
    // fallback), but real satellite data has been available for every run
    // so far, so it has been permanently empty in every database. Dropped
    // outright rather than left as a dead CREATE TABLE IF NOT EXISTS.
    try_exec(pool, "DROP TABLE IF EXISTS interstate_estimate", &mut steps).await;

    sqlx::query(INSPECT_PROC_SQL)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create merge_exiobase_year_inspect: {e}"))?;
    sqlx::query(MERGE_PROC_SQL)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create merge_exiobase_year: {e}"))?;

    Ok(())
}

// Exiobase's own region order (49 total), confirmed by reading unit.txt/
// Z.txt directly out of a downloaded IOT_*_pxp.zip — see
// PLAN-comprehensive.md's "Confirmed: Exiobase's regions have a fixed,
// discoverable order". Order is used only to seed `region.block_index`
// 1-49 below; comprehensive's own `trade_id` values never depend on
// block_index (see PLAN-comprehensive.md's "Trade ID scheme"). Names match
// profile/impacts/exiobase/exio-country-names.csv (not read from that file
// at runtime -- this Rust binary shouldn't depend on a sibling repo being
// checked out -- just kept in sync with it by hand).
const COMPREHENSIVE_REGIONS: [(&str, &str); 49] = [
    ("AT", "Austria"), ("BE", "Belgium"), ("BG", "Bulgaria"), ("CY", "Cyprus"),
    ("CZ", "Czech Republic"), ("DE", "Germany"), ("DK", "Denmark"), ("EE", "Estonia"),
    ("ES", "Spain"), ("FI", "Finland"), ("FR", "France"), ("GR", "Greece"),
    ("HR", "Croatia"), ("HU", "Hungary"), ("IE", "Ireland"), ("IT", "Italy"),
    ("LT", "Lithuania"), ("LU", "Luxembourg"), ("LV", "Latvia"), ("MT", "Malta"),
    ("NL", "Netherlands"), ("PL", "Poland"), ("PT", "Portugal"), ("RO", "Romania"),
    ("SE", "Sweden"), ("SI", "Slovenia"), ("SK", "Slovakia"), ("GB", "United Kingdom"),
    ("US", "United States"), ("JP", "Japan"), ("CN", "China"), ("CA", "Canada"),
    ("KR", "South Korea"), ("BR", "Brazil"), ("IN", "India"), ("MX", "Mexico"),
    ("RU", "Russia"), ("AU", "Australia"), ("CH", "Switzerland"), ("TR", "Turkey"),
    ("TW", "Taiwan"), ("NO", "Norway"), ("ID", "Indonesia"), ("ZA", "South Africa"),
    ("WA", "Rest of World, Asia and Pacific"), ("WL", "Rest of World, America"),
    ("WE", "Rest of World, Europe"), ("WF", "Rest of World, Africa"),
    ("WM", "Rest of World, Middle East"),
];

// POST /api/db/comprehensive/push-reference-tables
//
// Preflight step for trade_comprehensive.py (PLAN-comprehensive.md). Two
// targets, picked by `target` (mirrors InsertTradeDataRequest's own
// `target` field on /api/db/insert-trade-data):
//
//   - default (target omitted, or anything other than "industrydb"): the
//     per-year database `{EXIOBASE_NAME}_{year}` -- the same convention
//     already used for industrydb_2019/2021/2023 (year_database_name/
//     connect_to_exiobase_year/init_industry_tables_in_pool in main.rs).
//     Creates that database first if it doesn't exist yet (via
//     ensure_year_database_exists, using EXIOBASE_PROVISION_* credentials --
//     the regular EXIOBASE_USER doesn't have CREATEDB). No factor_id remap:
//     a from-scratch per-year database has nothing to remap against.
//   - target: "industrydb": the shared multi-year database, with `year` as
//     a real column on trade/trade_factor -- ensure_merge_infra's schema,
//     factor upserted via upsert_factor_rows_merged (remaps incoming
//     factor_id by (extension, stressor) against whatever's already in
//     industrydb; factor_id_map echoes that old->new remap so the caller
//     can immediately write a local factor.csv with industrydb's real ids).
//
// Either way, region seeding and industry/sector/sector_industry upserts
// are the same idempotent calls; only the trade/trade_factor destination and
// factor-table upsert differ. The large trade/trade_factor push itself
// bypasses this endpoint entirely -- Python writes those directly via
// psycopg2 (see PLAN-comprehensive.md) -- so this endpoint only ever sees a
// few hundred KB of CSV text per call.
#[derive(Deserialize)]
pub struct PushReferenceTablesRequest {
    pub year: String,
    #[serde(default)]
    pub target: Option<String>,
    pub factor_csv: Option<String>,
    pub industry_csv: Option<String>,
    pub sector_csv: Option<String>,
    pub sector_industry_csv: Option<String>,
}

pub async fn comprehensive_push_reference_tables(
    _data: web::Data<Arc<ApiState>>,
    req: web::Json<PushReferenceTablesRequest>,
) -> Result<HttpResponse> {
    let use_shared = req.target.as_deref() == Some("industrydb");

    let (pool, target_name) = if use_shared {
        let pool = match connect_to_industrydb().await {
            Ok(p) => p,
            Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({"success": false, "error": e}))),
        };
        if let Err(e) = ensure_merge_infra(&pool).await {
            return Ok(HttpResponse::InternalServerError()
                .json(json!({"success": false, "error": format!("Schema/procedure setup failed: {e}")})));
        }
        (pool, "industrydb".to_string())
    } else {
        let db_name = match year_database_name(&req.year) {
            Ok(n) => n,
            Err(e) => return Ok(HttpResponse::BadRequest().json(json!({"success": false, "error": e}))),
        };
        let pool = match connect_to_exiobase_year(&req.year).await {
            Ok(p) => p,
            Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({"success": false, "error": e}))),
        };
        if let Err(e) = init_industry_tables_in_pool(&pool).await {
            return Ok(HttpResponse::InternalServerError()
                .json(json!({"success": false, "error": format!("Schema setup failed: {e}")})));
        }
        (pool, db_name)
    };

    for (i, (code, name)) in COMPREHENSIVE_REGIONS.iter().enumerate() {
        let block_index = (i + 1) as i32;
        let _ = sqlx::query(
            "INSERT INTO region (country, block_index, name) VALUES ($1, $2, $3) \
             ON CONFLICT (country) DO UPDATE SET name = EXCLUDED.name",
        )
        .bind(code)
        .bind(block_index)
        .bind(name)
        .execute(&pool)
        .await;
    }

    let mut summary: Vec<serde_json::Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut factor_id_map: HashMap<i32, i32> = HashMap::new();

    if let Some(text) = req.factor_csv.as_deref() {
        if use_shared {
            match upsert_factor_rows_merged(&pool, text).await {
                Ok(map) => {
                    summary.push(json!({"file": "factor.csv", "rows": map.len()}));
                    factor_id_map = map;
                }
                Err(e) => errors.push(format!("factor.csv: {e}")),
            }
        } else {
            match upsert_factor_rows(&pool, text).await {
                Ok(n) => summary.push(json!({"file": "factor.csv", "rows": n})),
                Err(e) => errors.push(format!("factor.csv: {e}")),
            }
        }
    }
    if let Some(text) = req.industry_csv.as_deref() {
        match upsert_industry_rows(&pool, text).await {
            Ok(n) => summary.push(json!({"file": "industry.csv", "rows": n})),
            Err(e) => errors.push(format!("industry.csv: {e}")),
        }
    }
    if let Some(text) = req.sector_csv.as_deref() {
        match upsert_sector_rows(&pool, text).await {
            Ok(n) => summary.push(json!({"file": "sector.csv", "rows": n})),
            Err(e) => errors.push(format!("sector.csv: {e}")),
        }
    }
    if let Some(text) = req.sector_industry_csv.as_deref() {
        match upsert_sector_industry_rows(&pool, text).await {
            Ok(n) => summary.push(json!({"file": "sector_industry.csv", "rows": n})),
            Err(e) => errors.push(format!("sector_industry.csv: {e}")),
        }
    }

    Ok(HttpResponse::Ok().json(json!({
        "success": errors.is_empty(),
        "target": target_name,
        "region_seeded": COMPREHENSIVE_REGIONS.len(),
        "inserted": summary,
        "errors": errors,
        "factor_id_map": factor_id_map,
    })))
}

// Read-only pre-merge report — see PLAN-merge.md's "Pre-merge inspection"
// section. Uses one-shot `dblink(conninfo, query)` calls (opens/closes its
// own connection per call) rather than a named `dblink_connect` session,
// since this runs against a pooled sqlx connection that may be reused for
// an unrelated request next — a leftover named dblink connection would
// make the next caller's `dblink_connect` fail with "duplicate connection
// name".
const INSPECT_PROC_SQL: &str = r#"
CREATE OR REPLACE FUNCTION merge_exiobase_year_inspect(p_year integer, p_conninfo text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_trade_src bigint;
  v_trade_factor_src bigint;
  v_interstate_src bigint;
  v_interstate_factor_src bigint;
  v_trade_dst bigint;
  v_trade_factor_dst bigint;
  v_interstate_dst bigint;
  v_interstate_factor_dst bigint;
  v_factor_new int;
  v_factor_conflict int;
  v_industry_new int;
  v_sector_new int;
BEGIN
  SELECT c INTO v_trade_src FROM dblink(p_conninfo, 'SELECT count(*) FROM trade') AS t(c bigint);
  SELECT c INTO v_trade_factor_src FROM dblink(p_conninfo, 'SELECT count(*) FROM trade_factor') AS t(c bigint);
  SELECT c INTO v_interstate_src FROM dblink(p_conninfo, 'SELECT count(*) FROM interstate') AS t(c bigint);
  SELECT c INTO v_interstate_factor_src FROM dblink(p_conninfo, 'SELECT count(*) FROM interstate_factor') AS t(c bigint);

  SELECT count(*) INTO v_trade_dst FROM trade WHERE year = p_year;
  SELECT count(*) INTO v_trade_factor_dst FROM trade_factor WHERE year = p_year;
  SELECT count(*) INTO v_interstate_dst FROM interstate WHERE year = p_year;
  SELECT count(*) INTO v_interstate_factor_dst FROM interstate_factor WHERE year = p_year;

  -- New stressors this year introduces (no matching (extension, stressor) yet).
  SELECT count(*) INTO v_factor_new
  FROM dblink(p_conninfo, 'SELECT factor_id, extension, stressor FROM factor')
    AS s(factor_id integer, extension varchar(100), stressor text)
  LEFT JOIN factor f ON f.extension = s.extension AND f.stressor IS NOT DISTINCT FROM s.stressor
  WHERE f.factor_id IS NULL;

  -- The dangerous case: same factor_id already used in industrydb, but for
  -- a *different* stressor — a blind copy-by-factor_id would silently
  -- corrupt that row's meaning. Flagged here, never auto-resolved.
  SELECT count(*) INTO v_factor_conflict
  FROM dblink(p_conninfo, 'SELECT factor_id, extension, stressor FROM factor')
    AS s(factor_id integer, extension varchar(100), stressor text)
  JOIN factor f ON f.factor_id = s.factor_id
  WHERE f.extension IS DISTINCT FROM s.extension OR f.stressor IS DISTINCT FROM s.stressor;

  SELECT count(*) INTO v_industry_new
  FROM dblink(p_conninfo, 'SELECT industry_id FROM industry') AS s(industry_id varchar(10))
  LEFT JOIN industry i ON i.industry_id = s.industry_id
  WHERE i.industry_id IS NULL;

  SELECT count(*) INTO v_sector_new
  FROM dblink(p_conninfo, 'SELECT sector_id FROM sector') AS s(sector_id varchar(10))
  LEFT JOIN sector sc ON sc.sector_id = s.sector_id
  WHERE sc.sector_id IS NULL;

  RETURN jsonb_build_object(
    'year', p_year,
    'row_counts', jsonb_build_object(
      'trade', jsonb_build_object('source', v_trade_src, 'already_in_industrydb', v_trade_dst),
      'trade_factor', jsonb_build_object('source', v_trade_factor_src, 'already_in_industrydb', v_trade_factor_dst),
      'interstate', jsonb_build_object('source', v_interstate_src, 'already_in_industrydb', v_interstate_dst),
      'interstate_factor', jsonb_build_object('source', v_interstate_factor_src, 'already_in_industrydb', v_interstate_factor_dst)
    ),
    'factor', jsonb_build_object('new_stressors', v_factor_new, 'factor_id_conflicts', v_factor_conflict),
    'industry_new', v_industry_new,
    'sector_new', v_sector_new,
    'already_merged', (v_trade_dst > 0),
    'safe_to_merge', (v_factor_conflict = 0)
  );
END;
$$;
"#;

// The real merge. Safe to re-run for the same year — every INSERT is
// `ON CONFLICT ... DO NOTHING`. Uses TEMP tables (dropped explicitly at the
// end rather than relying on ON COMMIT DROP, since this runs over a pooled
// connection whose transaction boundaries aren't guaranteed one-per-call)
// to materialize the source year's `factor` rows once and build a
// src_factor_id -> dst_factor_id map, since factor_id is our own pipeline's
// row-position assignment, not an Exiobase-sourced identity — see
// PLAN-merge.md's "factor table" section. Never trusts a "new" stressor's
// source factor_id directly (a later year's new stressor could
// coincidentally reuse an id a different stressor already claimed) —
// always allocates a fresh one past the current max instead.
const MERGE_PROC_SQL: &str = r#"
CREATE OR REPLACE FUNCTION merge_exiobase_year(p_year integer, p_conninfo text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_factor_new int;
  v_industry int;
  v_sector int;
  v_sector_industry int;
  v_trade int;
  v_trade_factor int;
  v_interstate int;
  v_interstate_factor int;
BEGIN
  DROP TABLE IF EXISTS tmp_factor_src;
  CREATE TEMP TABLE tmp_factor_src AS
  SELECT * FROM dblink(p_conninfo, 'SELECT factor_id, extension, stressor, unit FROM factor')
    AS s(factor_id integer, extension varchar(100), stressor text, unit varchar(50));

  INSERT INTO factor (factor_id, extension, stressor, unit)
  SELECT (SELECT COALESCE(MAX(factor_id), 0) FROM factor) + ROW_NUMBER() OVER (ORDER BY s.factor_id),
         s.extension, s.stressor, s.unit
  FROM tmp_factor_src s
  LEFT JOIN factor f ON f.extension = s.extension AND f.stressor IS NOT DISTINCT FROM s.stressor
  WHERE f.factor_id IS NULL;
  GET DIAGNOSTICS v_factor_new = ROW_COUNT;

  DROP TABLE IF EXISTS tmp_factor_map;
  CREATE TEMP TABLE tmp_factor_map AS
  SELECT s.factor_id AS src_factor_id, f.factor_id AS dst_factor_id
  FROM tmp_factor_src s
  JOIN factor f ON f.extension = s.extension AND f.stressor IS NOT DISTINCT FROM s.stressor;

  INSERT INTO industry (industry_id, name, category)
  SELECT industry_id, name, category
  FROM dblink(p_conninfo, 'SELECT industry_id, name, category FROM industry')
    AS s(industry_id varchar(10), name text, category varchar(100))
  ON CONFLICT (industry_id) DO NOTHING;
  GET DIAGNOSTICS v_industry = ROW_COUNT;

  INSERT INTO sector (sector_id, name)
  SELECT sector_id, name
  FROM dblink(p_conninfo, 'SELECT sector_id, name FROM sector')
    AS s(sector_id varchar(10), name text)
  ON CONFLICT (sector_id) DO NOTHING;
  GET DIAGNOSTICS v_sector = ROW_COUNT;

  INSERT INTO sector_industry (sector_id, industry_id, weight)
  SELECT sector_id, industry_id, weight
  FROM dblink(p_conninfo, 'SELECT sector_id, industry_id, weight FROM sector_industry')
    AS s(sector_id varchar(10), industry_id varchar(10), weight numeric(10,6))
  ON CONFLICT (sector_id, industry_id) DO NOTHING;
  GET DIAGNOSTICS v_sector_industry = ROW_COUNT;

  INSERT INTO trade (year, trade_id, region1, region2, industry1, industry2, amount, flow_type, country)
  SELECT p_year, trade_id, region1, region2, industry1, industry2, amount, flow_type, country
  FROM dblink(p_conninfo, 'SELECT trade_id, region1, region2, industry1, industry2, amount, flow_type, country FROM trade')
    AS s(trade_id integer, region1 varchar(10), region2 varchar(10), industry1 varchar(10), industry2 varchar(10), amount numeric(18,4), flow_type varchar(20), country varchar(10))
  ON CONFLICT (year, trade_id) DO NOTHING;
  GET DIAGNOSTICS v_trade = ROW_COUNT;

  INSERT INTO trade_factor (year, trade_id, country, flow_type, factor_id, coefficient, level)
  SELECT p_year, s.trade_id, s.country, s.flow_type, m.dst_factor_id, s.coefficient, s.level
  FROM dblink(p_conninfo, 'SELECT trade_id, country, flow_type, factor_id, coefficient, level FROM trade_factor')
    AS s(trade_id integer, country varchar(10), flow_type varchar(20), factor_id integer, coefficient numeric(20,10), level numeric(20,6))
  JOIN tmp_factor_map m ON m.src_factor_id = s.factor_id
  ON CONFLICT (year, trade_id, factor_id) DO NOTHING;
  GET DIAGNOSTICS v_trade_factor = ROW_COUNT;

  INSERT INTO interstate (year, interstate_id, trade_id, country, state1, state2, sector1, sector2, state_industry_code, amount, commodity_code, industry_code, economic_multiplier)
  SELECT p_year, interstate_id, trade_id, country, state1, state2, sector1, sector2, state_industry_code, amount, commodity_code, industry_code, economic_multiplier
  FROM dblink(p_conninfo, 'SELECT interstate_id, trade_id, country, state1, state2, sector1, sector2, state_industry_code, amount, commodity_code, industry_code, economic_multiplier FROM interstate')
    AS s(interstate_id integer, trade_id integer, country varchar(2), state1 varchar(10), state2 varchar(10), sector1 varchar(10), sector2 varchar(10), state_industry_code varchar(30), amount numeric(18,4), commodity_code varchar(30), industry_code varchar(30), economic_multiplier numeric(10,6))
  ON CONFLICT (year, interstate_id) DO NOTHING;
  GET DIAGNOSTICS v_interstate = ROW_COUNT;

  INSERT INTO interstate_factor (year, interstate_id, factor_id, level, flow_type)
  SELECT p_year, s.interstate_id, m.dst_factor_id, s.level, s.flow_type
  FROM dblink(p_conninfo, 'SELECT interstate_id, factor_id, level, flow_type FROM interstate_factor')
    AS s(interstate_id integer, factor_id integer, level numeric(20,6), flow_type varchar(20))
  JOIN tmp_factor_map m ON m.src_factor_id = s.factor_id
  ON CONFLICT (year, interstate_id, factor_id) DO NOTHING;
  GET DIAGNOSTICS v_interstate_factor = ROW_COUNT;

  DROP TABLE IF EXISTS tmp_factor_src;
  DROP TABLE IF EXISTS tmp_factor_map;

  RETURN jsonb_build_object(
    'year', p_year,
    'inserted', jsonb_build_object(
      'factor_new', v_factor_new,
      'industry', v_industry,
      'sector', v_sector,
      'sector_industry', v_sector_industry,
      'trade', v_trade,
      'trade_factor', v_trade_factor,
      'interstate', v_interstate,
      'interstate_factor', v_interstate_factor
    )
  );
END;
$$;
"#;

// POST /api/db/merge-years/inspect
pub async fn merge_years_inspect(
    _data: web::Data<Arc<ApiState>>,
    req: web::Json<MergeYearRequest>,
) -> Result<HttpResponse> {
    let year_num = match parse_year(&req.year) {
        Ok(y) => y,
        Err(e) => return Ok(HttpResponse::BadRequest().json(json!({"success": false, "error": e}))),
    };
    let conninfo = match year_conninfo(&req.year) {
        Ok(c) => c,
        Err(e) => return Ok(HttpResponse::BadRequest().json(json!({"success": false, "error": e}))),
    };
    let pool = match connect_to_industrydb().await {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({"success": false, "error": e}))),
    };
    if let Err(e) = ensure_merge_infra(&pool).await {
        return Ok(HttpResponse::InternalServerError()
            .json(json!({"success": false, "error": format!("Schema/procedure setup failed: {e}")})));
    }

    let result: std::result::Result<serde_json::Value, sqlx::Error> =
        sqlx::query_scalar("SELECT merge_exiobase_year_inspect($1, $2)")
            .bind(year_num)
            .bind(&conninfo)
            .fetch_one(&pool)
            .await;

    match result {
        Ok(report) => Ok(HttpResponse::Ok().json(json!({"success": true, "report": report}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({"success": false, "error": e.to_string()}))),
    }
}

// POST /api/db/merge-years/run
pub async fn merge_years_run(
    _data: web::Data<Arc<ApiState>>,
    req: web::Json<MergeYearRequest>,
) -> Result<HttpResponse> {
    let year_num = match parse_year(&req.year) {
        Ok(y) => y,
        Err(e) => return Ok(HttpResponse::BadRequest().json(json!({"success": false, "error": e}))),
    };
    let conninfo = match year_conninfo(&req.year) {
        Ok(c) => c,
        Err(e) => return Ok(HttpResponse::BadRequest().json(json!({"success": false, "error": e}))),
    };
    let pool = match connect_to_industrydb().await {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({"success": false, "error": e}))),
    };
    if let Err(e) = ensure_merge_infra(&pool).await {
        return Ok(HttpResponse::InternalServerError()
            .json(json!({"success": false, "error": format!("Schema/procedure setup failed: {e}")})));
    }

    let result: std::result::Result<serde_json::Value, sqlx::Error> =
        sqlx::query_scalar("SELECT merge_exiobase_year($1, $2)")
            .bind(year_num)
            .bind(&conninfo)
            .fetch_one(&pool)
            .await;

    match result {
        Ok(report) => Ok(HttpResponse::Ok().json(json!({"success": true, "report": report}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({"success": false, "error": e.to_string()}))),
    }
}

// ============================================================
// Direct import: load a year's CSVs straight into industrydb
// ============================================================

// Parses factor.csv (via the same parse_factor_csv main.rs's
// upsert_factor_rows uses) then reconciles every row against industrydb's
// own `factor` table by (extension, stressor), never by raw factor_id —
// see PLAN-merge.md's "factor table" section: factor_id is only this
// pipeline's row-position assignment, not an Exiobase-sourced identity, so
// it isn't safe to assume it agrees between an incoming year and what's
// already in industrydb. Returns a src_factor_id -> dst_factor_id map
// covering every row in the file, inserting genuinely new stressors along
// the way with a freshly allocated id past the current max — never the
// source's raw id, since a later year's "new" stressor could
// coincidentally reuse an id a different stressor already claimed.
async fn upsert_factor_rows_merged(pool: &Pool<Postgres>, text: &str) -> Result<HashMap<i32, i32>, String> {
    let src_rows = parse_factor_csv(text)?; // (factor_id, unit, stressor, extension)

    // factor_id::integer: factor.factor_id is SMALLINT on disk (well under
    // 1,000 rows), but every factor_id in Rust stays i32 (the CSV-parsed,
    // src_factor_id/dst_factor_id-mapped value) -- casting here at the one
    // decode site keeps that boundary, instead of threading i16 through
    // factor_id_map/new_rows/etc. sqlx's Decode<i32> only accepts int4 on
    // the wire, so this cast isn't optional -- decoding a real int2 into it
    // errors at runtime.
    let existing: Vec<(i32, String, String)> =
        sqlx::query_as("SELECT factor_id::integer, extension, stressor FROM factor")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
    let mut by_identity: HashMap<(String, String), i32> = HashMap::new();
    let mut max_id: i32 = 0;
    for (fid, ext, stressor) in existing {
        by_identity.insert((ext, stressor), fid);
        if fid > max_id {
            max_id = fid;
        }
    }

    let mut map: HashMap<i32, i32> = HashMap::new();
    let mut new_rows: Vec<(i32, String, String, String)> = Vec::new(); // (dst_factor_id, extension, stressor, unit)
    for (src_id, unit, stressor, extension) in &src_rows {
        let key = (extension.clone(), stressor.clone());
        if let Some(&dst_id) = by_identity.get(&key) {
            map.insert(*src_id, dst_id);
        } else {
            max_id += 1;
            by_identity.insert(key, max_id);
            new_rows.push((max_id, extension.clone(), stressor.clone(), unit.clone()));
            map.insert(*src_id, max_id);
        }
    }

    for chunk in new_rows.chunks(500) {
        let mut qb =
            sqlx::QueryBuilder::<Postgres>::new("INSERT INTO factor (factor_id, extension, stressor, unit) ");
        qb.push_values(chunk, |mut b, (fid, ext, stressor, unit)| {
            b.push_bind(fid).push_bind(ext).push_bind(stressor).push_bind(unit);
        });
        qb.push(" ON CONFLICT (extension, stressor) DO NOTHING");
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }

    Ok(map)
}

// Called from db_insert_trade_data when the request body has
// `"target": "industrydb"` — same GitHub CSV sources as the normal
// per-year loader, but writes straight into the shared industrydb with
// the year column and factor_id remapping applied inline (via the same
// insert_* functions main.rs's per-year loader uses, just called with
// Some(year)/Some(factor_map) instead of None), skipping the per-year
// database and the (currently Azure-blocked) dblink merge step entirely.
// Safe to re-run for the same year: every insert here is
// `ON CONFLICT ... DO NOTHING`.
pub async fn insert_trade_data_direct(year_str: String, country: String, flow_types: Vec<String>) -> Result<HttpResponse> {
    let year_num: i32 = match year_str.parse() {
        Ok(y) => y,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(json!({"success": false, "error": "Invalid year"})))
        }
    };

    let pool = match connect_to_industrydb().await {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({"success": false, "error": e}))),
    };
    if let Err(e) = ensure_merge_infra(&pool).await {
        return Ok(HttpResponse::InternalServerError()
            .json(json!({"success": false, "error": format!("Schema/procedure setup failed: {e}")})));
    }

    // Part 1 of the multi-country fix (PLAN-merge.md): assign (or reuse)
    // this country's block index in industrydb before computing any
    // trade_id — shared across every year merged here (see
    // ensure_merge_infra's region comment).
    let country_block_index = match get_or_assign_country_block(&pool, &country).await {
        Ok(idx) => idx,
        Err(e) => return Ok(HttpResponse::InternalServerError().json(json!({"success": false, "error": e}))),
    };

    // Part 2: which (country, flow_type) pairs already have trade rows for
    // *this year* in industrydb — scoped by year here (unlike the per-year
    // databases, industrydb holds every year in one trade table) — so a
    // bilateral flow another country's file already contributed for this
    // year gets skipped before it's even parsed.
    let known: std::collections::HashSet<(String, String)> =
        sqlx::query_as::<_, (String, String)>("SELECT DISTINCT country, flow_type FROM trade WHERE year = $1")
            .bind(year_num)
            .fetch_all(&pool)
            .await
            .unwrap_or_default()
            .into_iter()
            .collect();

    let base = "https://raw.githubusercontent.com/ModelEarth/trade-data/refs/heads/main/year";
    let mut summary: Vec<serde_json::Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // 1. factor.csv — builds this year's src -> dst factor_id map first;
    // every later step that touches factor_id depends on it.
    let mut factor_map: HashMap<i32, i32> = HashMap::new();
    let factor_url = format!("{base}/{year_str}/factor.csv");
    match fetch_github_csv(&factor_url).await {
        Err(e) => errors.push(format!("factor.csv: {e}")),
        Ok(text) => match upsert_factor_rows_merged(&pool, &text).await {
            Ok(m) => {
                summary.push(json!({"file": "factor.csv", "rows": m.len()}));
                factor_map = m;
            }
            Err(e) => errors.push(format!("factor.csv insert: {e}")),
        },
    }

    // 2. industry.csv, sector.csv, sector_industry.csv — no year column,
    // no remap; the existing per-year upsert functions work unchanged
    // against industrydb since these tables have the identical schema
    // either way.
    let industry_url = format!("{base}/{year_str}/industry.csv");
    match fetch_github_csv(&industry_url).await {
        Err(e) => errors.push(format!("industry.csv: {e}")),
        Ok(text) => match upsert_industry_rows(&pool, &text).await {
            Ok(n) => summary.push(json!({"file": "industry.csv", "rows": n})),
            Err(e) => errors.push(format!("industry.csv insert: {e}")),
        },
    }
    let sector_url = format!("{base}/{year_str}/sector.csv");
    match fetch_github_csv(&sector_url).await {
        Err(e) => errors.push(format!("sector.csv: {e}")),
        Ok(text) => match upsert_sector_rows(&pool, &text).await {
            Ok(n) => summary.push(json!({"file": "sector.csv", "rows": n})),
            Err(e) => errors.push(format!("sector.csv insert: {e}")),
        },
    }
    let sector_industry_url = format!("{base}/{year_str}/sector_industry.csv");
    match fetch_github_csv(&sector_industry_url).await {
        Err(e) => errors.push(format!("sector_industry.csv: {e}")),
        Ok(text) => match upsert_sector_industry_rows(&pool, &text).await {
            Ok(n) => summary.push(json!({"file": "sector_industry.csv", "rows": n})),
            Err(e) => errors.push(format!("sector_industry.csv insert: {e}")),
        },
    }

    // 3. trade.csv + trade_factor.csv per flow type — same functions as
    // the per-year loader, with year/factor_map now Some(...).
    for flow_type in &flow_types {
        let trade_url = format!("{base}/{year_str}/{country}/{flow_type}/trade.csv");
        let mut skipped_csv_trade_ids: std::collections::HashSet<i32> = std::collections::HashSet::new();
        match fetch_github_csv(&trade_url).await {
            Err(e) => errors.push(format!("{flow_type}/trade.csv: {e}")),
            Ok(text) => match insert_trade_rows(&pool, Some(year_num), &text, flow_type, &country, country_block_index, &known).await {
                Ok((n, skipped_ids)) => {
                    summary.push(json!({"file": format!("{flow_type}/trade.csv"), "rows": n, "skipped_duplicate": skipped_ids.len()}));
                    skipped_csv_trade_ids = skipped_ids;
                }
                Err(e) => errors.push(format!("{flow_type}/trade.csv insert: {e}")),
            },
        }

        let tf_url = format!("{base}/{year_str}/{country}/{flow_type}/trade_factor.csv");
        match fetch_github_csv(&tf_url).await {
            Err(e) => errors.push(format!("{flow_type}/trade_factor.csv: {e}")),
            Ok(text) => match insert_trade_factor_rows(&pool, Some(year_num), &text, flow_type, &country, country_block_index, Some(&factor_map), &skipped_csv_trade_ids).await {
                Ok(o) => summary.push(json!({"file": format!("{flow_type}/trade_factor.csv"), "rows": o.inserted, "skipped": o.skipped})),
                Err(e) => errors.push(format!("{flow_type}/trade_factor.csv insert: {e}")),
            },
        }
    }

    // 4. US BEA interstate data (domestic only). Gated on "domestic" being
    // selected — see db_insert_trade_data's matching comment (interstate.csv's
    // trade_id references the domestic trade.csv's rows; loading it without
    // domestic would FK-violate).
    if country == "US" && flow_types.iter().any(|f| f == "domestic") {
        let interstate_url = format!("{base}/{year_str}/US/domestic/interstate.csv");
        match fetch_github_csv(&interstate_url).await {
            Err(e) => errors.push(format!("interstate.csv: {e}")),
            Ok(text) => match insert_interstate_rows(&pool, Some(year_num), &text, &country).await {
                Ok(o) => summary.push(json!({"file": "interstate.csv", "rows": o.inserted, "skipped": o.skipped})),
                Err(e) => errors.push(format!("interstate.csv insert: {e}")),
            },
        }

        let isf_url = format!("{base}/{year_str}/US/domestic/interstate_factor.csv");
        match fetch_github_csv(&isf_url).await {
            Err(e) => errors.push(format!("interstate_factor.csv: {e}")),
            Ok(text) => match insert_interstate_factor_rows(&pool, Some(year_num), &text, Some(&factor_map)).await {
                Ok(o) => summary.push(json!({"file": "interstate_factor.csv", "rows": o.inserted, "skipped": o.skipped})),
                Err(e) => errors.push(format!("interstate_factor.csv insert: {e}")),
            },
        }
    }

    Ok(HttpResponse::Ok().json(json!({
        "success": errors.is_empty(),
        "target": "industrydb",
        "year": year_str,
        "country": country,
        "flow_types": flow_types,
        "inserted": summary,
        "errors": errors
    })))
}
