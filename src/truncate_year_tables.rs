// One-off utility: clears trade/trade_factor/interstate/interstate_factor/
// interstate_estimate in one or more per-year Industry Databases, so the
// loader (db_insert_trade_data) can reload them from the fixed CSVs without
// every row being skipped by ON CONFLICT DO NOTHING on an unchanged natural
// key -- see PLAN-merge.md's "Fixing historical trade_id/interstate_id".
// Not wired into the API. Run directly:
//   cargo run --bin truncate_year_tables -- 2019 2021
use sqlx::postgres::PgPoolOptions;
use std::env;

#[tokio::main]
async fn main() {
    dotenv::from_path("../docker/.env").ok();

    let years: Vec<String> = env::args().skip(1).collect();
    if years.is_empty() {
        eprintln!("Usage: truncate_year_tables <year> [<year> ...]");
        std::process::exit(1);
    }

    let host = env::var("EXIOBASE_HOST").expect("EXIOBASE_HOST not set");
    let user = env::var("EXIOBASE_USER").expect("EXIOBASE_USER not set");
    let password = env::var("EXIOBASE_PASSWORD").expect("EXIOBASE_PASSWORD not set");
    let name = env::var("EXIOBASE_NAME").expect("EXIOBASE_NAME not set");
    let ssl_mode = env::var("EXIOBASE_SSL_MODE").unwrap_or_else(|_| "require".to_string());

    for year in &years {
        let db_name = format!("{name}_{year}");
        let url = format!("postgres://{user}:{password}@{host}:5432/{db_name}?sslmode={ssl_mode}");
        println!("Connecting to {db_name}...");
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .expect("connect failed");

        for table in ["interstate_factor, interstate_estimate, interstate", "trade_factor, trade"] {
            match sqlx::query(&format!("TRUNCATE TABLE {table}")).execute(&pool).await {
                Ok(_) => println!("  Truncated {table}"),
                Err(e) => println!("  SKIP {table}: {e}"),
            }
        }
    }
    println!("Done.");
}
