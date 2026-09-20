// Stage 2 of PLAN-merge.md: merging per-year Industry Databases
// (industrydb_2019, industrydb_2021, and future industrydb_{year}) into
// the shared, multi-year `industrydb` (EXIOBASE_NAME itself — not a
// per-year database). The actual data movement happens entirely inside
// Azure Postgres via the `dblink` extension: this module only ensures
// `industrydb`'s schema/procedures exist and invokes them over an ad-hoc
// `dblink` connection string built per call. Row data never round-trips
// through this Rust process or a local machine.
//
// Two endpoints, each a thin wrapper around the matching SQL function:
// `POST /api/db/merge-years/inspect` (read-only dry-run report) and
// `POST /api/db/merge-years/run` (the real merge — safe to re-run, since
// every INSERT here is `ON CONFLICT ... DO NOTHING`).

use actix_web::{web, HttpResponse, Result};
use serde::Deserialize;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{ensure_database_exists, try_exec, year_database_name, ApiState};

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
            factor_id INTEGER NOT NULL PRIMARY KEY,
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

    // trade/trade_factor/interstate/interstate_factor/interstate_estimate:
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
            flow_type  VARCHAR(10)   NOT NULL DEFAULT 'unknown',
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

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trade_factor (
            year        SMALLINT     NOT NULL,
            trade_id    INTEGER      NOT NULL,
            country     VARCHAR(10)  NOT NULL,
            flow_type   VARCHAR(10)  NOT NULL,
            factor_id   INTEGER      NOT NULL,
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
            factor_id     INTEGER  NOT NULL,
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

    // Empty in both 2019 and 2021 today (no satellite-factor gaps yet), but
    // structurally the same per-year concern as interstate_factor — needs
    // `year` in its PK for the same reason, even though PLAN-merge.md's
    // Stage 2 section only calls out the other 4 tables by name.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS interstate_estimate (
            year              SMALLINT NOT NULL,
            interstate_id     INTEGER  NOT NULL,
            employment_impact NUMERIC(20,10),
            flow_type         VARCHAR(20),
            PRIMARY KEY (year, interstate_id),
            CONSTRAINT fk_ise_interstate FOREIGN KEY (year, interstate_id) REFERENCES interstate(year, interstate_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

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
  v_interstate_estimate int;
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
    AS s(trade_id integer, region1 varchar(10), region2 varchar(10), industry1 varchar(10), industry2 varchar(10), amount numeric(18,4), flow_type varchar(10), country varchar(10))
  ON CONFLICT (year, trade_id) DO NOTHING;
  GET DIAGNOSTICS v_trade = ROW_COUNT;

  INSERT INTO trade_factor (year, trade_id, country, flow_type, factor_id, coefficient, level)
  SELECT p_year, s.trade_id, s.country, s.flow_type, m.dst_factor_id, s.coefficient, s.level
  FROM dblink(p_conninfo, 'SELECT trade_id, country, flow_type, factor_id, coefficient, level FROM trade_factor')
    AS s(trade_id integer, country varchar(10), flow_type varchar(10), factor_id integer, coefficient numeric(20,10), level numeric(20,6))
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

  INSERT INTO interstate_estimate (year, interstate_id, employment_impact, flow_type)
  SELECT p_year, interstate_id, employment_impact, flow_type
  FROM dblink(p_conninfo, 'SELECT interstate_id, employment_impact, flow_type FROM interstate_estimate')
    AS s(interstate_id integer, employment_impact numeric(20,10), flow_type varchar(20))
  ON CONFLICT (year, interstate_id) DO NOTHING;
  GET DIAGNOSTICS v_interstate_estimate = ROW_COUNT;

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
      'interstate_factor', v_interstate_factor,
      'interstate_estimate', v_interstate_estimate
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
