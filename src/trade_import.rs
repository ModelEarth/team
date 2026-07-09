use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgPool, QueryBuilder, Row};
use std::sync::Arc;
use std::time::Duration;

use crate::ApiState;

const BATCH_SIZE: usize = 500;
const GITHUB_BASE: &str =
    "https://raw.githubusercontent.com/ModelEarth/trade-data/refs/heads/main/year";
const FLOW_TYPES: &[&str] = &["domestic", "imports", "exports"];
const MAX_CONNECT_RETRIES: u32 = 3;

async fn get_exiobase_pool() -> anyhow::Result<PgPool> {
    let host = std::env::var("EXIOBASE_HOST")?;
    let port = std::env::var("EXIOBASE_PORT").unwrap_or_else(|_| "5432".to_string());
    let name = std::env::var("EXIOBASE_NAME")?;
    let user = std::env::var("EXIOBASE_USER")?;
    let password = std::env::var("EXIOBASE_PASSWORD")?;
    let ssl = std::env::var("EXIOBASE_SSL_MODE").unwrap_or_else(|_| "require".to_string());
    let url = format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl}");

    let mut last_err = anyhow::anyhow!("no attempts made");
    for attempt in 1..=MAX_CONNECT_RETRIES {
        match PgPool::connect(&url).await {
            Ok(pool) => return Ok(pool),
            Err(e) => {
                log::warn!("DB connect attempt {attempt}/{MAX_CONNECT_RETRIES} failed: {e}");
                last_err = e.into();
                tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
            }
        }
    }
    Err(last_err)
}

#[derive(Deserialize)]
pub struct InsertTradeDataRequest {
    pub year: String,
    pub country: String,
}

#[derive(Serialize)]
pub struct InsertTradeDataResponse {
    pub success: bool,
    pub message: String,
    pub rows_inserted: RowCounts,
    pub rows_skipped: SkippedCounts,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Default)]
pub struct RowCounts {
    pub factor: usize,
    pub industry: usize,
    pub trade: usize,
    pub trade_factor: usize,
}

#[derive(Serialize, Default)]
pub struct SkippedCounts {
    pub trade: usize,
    pub trade_factor: usize,
}

// POST /api/trade/insert
pub async fn insert_trade_data(
    _data: web::Data<Arc<ApiState>>,
    req: web::Json<InsertTradeDataRequest>,
) -> Result<HttpResponse> {
    let year = req.year.trim().to_string();
    let country = req.country.trim().to_uppercase();

    if year.parse::<u16>().is_err() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": format!("Invalid year '{year}' — must be a number like 2019 or 2022")
        })));
    }
    if country.len() != 2 || !country.chars().all(|c| c.is_ascii_alphabetic()) {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": format!("Invalid country '{country}' — must be a 2-letter code like US or CN")
        })));
    }

    let pool = match get_exiobase_pool().await {
        Ok(p) => p,
        Err(e) => {
            return Ok(HttpResponse::ServiceUnavailable().json(json!({
                "success": false,
                "error": format!("Could not connect to industry database after {MAX_CONNECT_RETRIES} attempts: {e}")
            })));
        }
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_default();

    let mut counts = RowCounts::default();
    let mut skipped = SkippedCounts::default();
    let mut errors: Vec<String> = vec![];

    match fetch_and_insert_factor(&client, &pool, &year).await {
        Ok(n) => counts.factor = n,
        Err(e) => errors.push(format!("factor: {e}")),
    }

    match fetch_and_insert_industry(&client, &pool, &year).await {
        Ok(n) => counts.industry = n,
        Err(e) => errors.push(format!("industry: {e}")),
    }

    // Clear existing data for this year/country before re-inserting to prevent duplicates
    for flow in FLOW_TYPES {
        if let Err(e) = sqlx::query(
            "DELETE FROM trade_factor WHERE year = $1 AND country = $2 AND flow_type = $3",
        )
        .bind(year.parse::<i16>().unwrap_or(0))
        .bind(&country)
        .bind(*flow)
        .execute(&pool)
        .await
        {
            errors.push(format!("clear trade_factor/{flow}: {e}"));
            continue;
        }

        if let Err(e) = sqlx::query(
            "DELETE FROM trade WHERE year = $1 AND country = $2 AND flow_type = $3",
        )
        .bind(year.parse::<i16>().unwrap_or(0))
        .bind(&country)
        .bind(*flow)
        .execute(&pool)
        .await
        {
            errors.push(format!("clear trade/{flow}: {e}"));
            continue;
        }

        match fetch_and_insert_trade(&client, &pool, &year, &country, flow).await {
            Ok((inserted, skipped_n)) => {
                counts.trade += inserted;
                skipped.trade += skipped_n;
            }
            Err(e) => errors.push(format!("trade/{flow}: {e}")),
        }

        match fetch_and_insert_trade_factor(&client, &pool, &year, &country, flow).await {
            Ok((inserted, skipped_n)) => {
                counts.trade_factor += inserted;
                skipped.trade_factor += skipped_n;
            }
            Err(e) => errors.push(format!("trade_factor/{flow}: {e}")),
        }
    }

    let success = errors.is_empty();
    let message = if success {
        format!(
            "Imported {year}/{country}: {} factors, {} industries, {} trade rows (skipped {}), {} trade_factor rows (skipped {})",
            counts.factor, counts.industry, counts.trade, skipped.trade, counts.trade_factor, skipped.trade_factor
        )
    } else {
        format!("Completed with {} error(s): {}", errors.len(), errors.join("; "))
    };

    Ok(HttpResponse::Ok().json(InsertTradeDataResponse {
        success,
        message,
        rows_inserted: counts,
        rows_skipped: skipped,
        error: if errors.is_empty() { None } else { Some(errors.join("; ")) },
    }))
}

// GET /api/trade/schema
pub async fn industry_schema(_data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    let pool = match get_exiobase_pool().await {
        Ok(p) => p,
        Err(e) => {
            return Ok(HttpResponse::ServiceUnavailable().json(json!({
                "success": false,
                "error": format!("Could not connect to industry database: {e}")
            })));
        }
    };

    let rows = sqlx::query(
        r#"
        SELECT
            t.table_name,
            COALESCE(s.n_live_tup, 0)::bigint AS row_count
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name
        "#,
    )
    .fetch_all(&pool)
    .await;

    match rows {
        Ok(rows) => {
            let tables: Vec<serde_json::Value> = rows
                .iter()
                .map(|r| {
                    let name: String = r.try_get("table_name").unwrap_or_default();
                    let count: i64 = r.try_get("row_count").unwrap_or(0);
                    json!({ "table": name, "row_count": count })
                })
                .collect();
            Ok(HttpResponse::Ok().json(json!({ "success": true, "tables": tables })))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
            "success": false,
            "error": e.to_string()
        }))),
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async fn fetch_csv_text(client: &reqwest::Client, url: &str) -> anyhow::Result<String> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("HTTP {} for {url}", resp.status());
    }
    Ok(resp.text().await?)
}

struct FactorRow {
    factor_id: i32,
    unit: String,
    stressor: String,
    extension: String,
}

struct IndustryRow {
    industry_id: String,
    name: String,
    category: String,
}

struct TradeRow {
    trade_id: i32,
    year: i16,
    region1: String,
    region2: String,
    industry1: String,
    industry2: String,
    amount: f64,
    flow_type: String,
    country: String,
}

struct TradeFactorRow {
    trade_id: i32,
    year: i16,
    country: String,
    flow_type: String,
    factor_id: i32,
    level: f64,
}

async fn flush_factors(pool: &PgPool, batch: &mut Vec<FactorRow>) -> anyhow::Result<()> {
    if batch.is_empty() { return Ok(()); }
    let mut qb = QueryBuilder::new("INSERT INTO factor (factor_id, unit, stressor, extension) ");
    qb.push_values(batch.drain(..), |mut b, r| {
        b.push_bind(r.factor_id).push_bind(r.unit).push_bind(r.stressor).push_bind(r.extension);
    });
    qb.push(" ON CONFLICT (factor_id) DO NOTHING");
    qb.build().execute(pool).await?;
    Ok(())
}

async fn flush_industries(pool: &PgPool, batch: &mut Vec<IndustryRow>) -> anyhow::Result<()> {
    if batch.is_empty() { return Ok(()); }
    let mut qb = QueryBuilder::new("INSERT INTO industry (industry_id, name, category) ");
    qb.push_values(batch.drain(..), |mut b, r| {
        b.push_bind(r.industry_id).push_bind(r.name).push_bind(r.category);
    });
    qb.push(" ON CONFLICT (industry_id) DO NOTHING");
    qb.build().execute(pool).await?;
    Ok(())
}

async fn flush_trade(pool: &PgPool, batch: &mut Vec<TradeRow>) -> anyhow::Result<()> {
    if batch.is_empty() { return Ok(()); }
    let mut qb = QueryBuilder::new(
        "INSERT INTO trade (trade_id, year, region1, region2, industry1, industry2, amount, flow_type, country) ",
    );
    qb.push_values(batch.drain(..), |mut b, r| {
        b.push_bind(r.trade_id)
            .push_bind(r.year)
            .push_bind(r.region1)
            .push_bind(r.region2)
            .push_bind(r.industry1)
            .push_bind(r.industry2)
            .push_bind(r.amount)
            .push_bind(r.flow_type)
            .push_bind(r.country);
    });
    qb.build().execute(pool).await?;
    Ok(())
}

async fn flush_trade_factor(pool: &PgPool, batch: &mut Vec<TradeFactorRow>) -> anyhow::Result<()> {
    if batch.is_empty() { return Ok(()); }
    let mut qb = QueryBuilder::new(
        "INSERT INTO trade_factor (trade_id, year, country, flow_type, factor_id, level) ",
    );
    qb.push_values(batch.drain(..), |mut b, r| {
        b.push_bind(r.trade_id)
            .push_bind(r.year)
            .push_bind(r.country)
            .push_bind(r.flow_type)
            .push_bind(r.factor_id)
            .push_bind(r.level);
    });
    qb.build().execute(pool).await?;
    Ok(())
}

async fn fetch_and_insert_factor(
    client: &reqwest::Client,
    pool: &PgPool,
    year: &str,
) -> anyhow::Result<usize> {
    let url = format!("{GITHUB_BASE}/{year}/factor.csv");
    let body = fetch_csv_text(client, &url).await?;
    let mut rdr = csv::Reader::from_reader(body.as_bytes());

    let mut batch: Vec<FactorRow> = Vec::with_capacity(BATCH_SIZE);
    let mut count = 0usize;

    for result in rdr.records() {
        let rec = result?;
        let factor_id: i32 = match rec.get(0).unwrap_or("").parse() {
            Ok(id) if id > 0 => id,
            _ => {
                log::warn!("factor row {count}: invalid factor_id, skipping");
                continue;
            }
        };
        batch.push(FactorRow {
            factor_id,
            unit: rec.get(1).unwrap_or("").to_string(),
            stressor: rec.get(2).unwrap_or("").to_string(),
            extension: rec.get(3).unwrap_or("").to_string(),
        });
        count += 1;
        if batch.len() >= BATCH_SIZE {
            flush_factors(pool, &mut batch).await?;
        }
    }
    flush_factors(pool, &mut batch).await?;
    Ok(count)
}

async fn fetch_and_insert_industry(
    client: &reqwest::Client,
    pool: &PgPool,
    year: &str,
) -> anyhow::Result<usize> {
    let url = format!("{GITHUB_BASE}/{year}/industry.csv");
    let body = fetch_csv_text(client, &url).await?;
    let mut rdr = csv::Reader::from_reader(body.as_bytes());

    let mut batch: Vec<IndustryRow> = Vec::with_capacity(BATCH_SIZE);
    let mut count = 0usize;

    for result in rdr.records() {
        let rec = result?;
        let industry_id = rec.get(0).unwrap_or("").trim().to_string();
        if industry_id.is_empty() {
            log::warn!("industry row {count}: empty industry_id, skipping");
            continue;
        }
        batch.push(IndustryRow {
            industry_id,
            name: rec.get(1).unwrap_or("").to_string(),
            category: rec.get(2).unwrap_or("").to_string(),
        });
        count += 1;
        if batch.len() >= BATCH_SIZE {
            flush_industries(pool, &mut batch).await?;
        }
    }
    flush_industries(pool, &mut batch).await?;
    Ok(count)
}

async fn fetch_and_insert_trade(
    client: &reqwest::Client,
    pool: &PgPool,
    year: &str,
    country: &str,
    flow_type: &str,
) -> anyhow::Result<(usize, usize)> {
    let url = format!("{GITHUB_BASE}/{year}/{country}/{flow_type}/trade.csv");
    let body = match fetch_csv_text(client, &url).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("Skipping {url}: {e}");
            return Ok((0, 0));
        }
    };
    let mut rdr = csv::Reader::from_reader(body.as_bytes());
    let year_i: i16 = year.parse().map_err(|_| anyhow::anyhow!("invalid year: {year}"))?;

    let mut batch: Vec<TradeRow> = Vec::with_capacity(BATCH_SIZE);
    let mut inserted = 0usize;
    let mut skipped = 0usize;

    for result in rdr.records() {
        let rec = result?;
        let trade_id: i32 = match rec.get(0).unwrap_or("").parse() {
            Ok(id) if id > 0 => id,
            _ => { skipped += 1; continue; }
        };
        let industry1 = rec.get(4).unwrap_or("").trim().to_string();
        let industry2 = rec.get(5).unwrap_or("").trim().to_string();
        if industry1.is_empty() || industry2.is_empty() {
            skipped += 1;
            continue;
        }
        let amount: f64 = rec.get(6).unwrap_or("0").parse().unwrap_or(0.0);
        if !amount.is_finite() {
            skipped += 1;
            continue;
        }

        batch.push(TradeRow {
            trade_id,
            year: year_i,
            region1: rec.get(2).unwrap_or("").to_string(),
            region2: rec.get(3).unwrap_or("").to_string(),
            industry1,
            industry2,
            amount,
            flow_type: flow_type.to_string(),
            country: country.to_string(),
        });
        inserted += 1;
        if batch.len() >= BATCH_SIZE {
            flush_trade(pool, &mut batch).await?;
        }
    }
    flush_trade(pool, &mut batch).await?;
    Ok((inserted, skipped))
}

async fn fetch_and_insert_trade_factor(
    client: &reqwest::Client,
    pool: &PgPool,
    year: &str,
    country: &str,
    flow_type: &str,
) -> anyhow::Result<(usize, usize)> {
    let url = format!("{GITHUB_BASE}/{year}/{country}/{flow_type}/trade_factor.csv");
    let body = match fetch_csv_text(client, &url).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("Skipping {url}: {e}");
            return Ok((0, 0));
        }
    };
    let mut rdr = csv::Reader::from_reader(body.as_bytes());
    let year_i: i16 = year.parse().map_err(|_| anyhow::anyhow!("invalid year: {year}"))?;

    let mut batch: Vec<TradeFactorRow> = Vec::with_capacity(BATCH_SIZE);
    let mut inserted = 0usize;
    let mut skipped = 0usize;

    for result in rdr.records() {
        let rec = result?;
        let trade_id: i32 = match rec.get(0).unwrap_or("").parse() {
            Ok(id) if id > 0 => id,
            _ => { skipped += 1; continue; }
        };
        let factor_id: i32 = match rec.get(1).unwrap_or("").parse() {
            Ok(id) if id > 0 => id,
            _ => { skipped += 1; continue; }
        };
        let level: f64 = rec.get(2).unwrap_or("0").parse().unwrap_or(0.0);
        if !level.is_finite() {
            skipped += 1;
            continue;
        }

        batch.push(TradeFactorRow {
            trade_id,
            year: year_i,
            country: country.to_string(),
            flow_type: flow_type.to_string(),
            factor_id,
            level,
        });
        inserted += 1;
        if batch.len() >= BATCH_SIZE {
            flush_trade_factor(pool, &mut batch).await?;
        }
    }
    flush_trade_factor(pool, &mut batch).await?;
    Ok((inserted, skipped))
}
