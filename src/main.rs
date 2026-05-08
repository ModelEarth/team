// src/main.rs
use actix_cors::Cors;
use actix_web::{web, App, HttpResponse, HttpServer, Result, middleware, HttpRequest};
use anyhow::Context;
use chrono::{Utc, NaiveDate, NaiveDateTime};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row, Column, ValueRef, TypeInfo};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::process::{Child, Command};
use std::time::{SystemTime, UNIX_EPOCH};
use std::path::Path;
use uuid::Uuid;
use url::Url;
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config as NotifyConfig};
use std::sync::mpsc::channel;

// Google Sheets API imports (TODO: Fix version conflicts)
// use google_sheets4::{Sheets, api::ValueRange};
// use google_apis_common::oauth2::{ServiceAccountAuthenticator, ServiceAccountKey};
// use hyper::Client;
// use hyper_rustls::HttpsConnectorBuilder;

mod import;
mod gemini_insights;
mod claude_insights;
mod unified_insights;
mod recommendations;
mod oauth;
mod prompts;
mod semantic_search;
mod api_integration;
use recommendations::RecommendationRequest;
use oauth::{OAuthConfig, UserSession, OAuthUrlResponse};

// Configuration structure
#[derive(Debug, Deserialize, Clone)]
struct Config {
    database_url: String,
    gemini_api_key: String,
    anthropic_api_key: String,
    server_host: String,
    server_port: u16,
    excel_file_path: String,
    site_favicon: Option<String>,
}

// Thread-safe configuration holder
type SharedConfig = Arc<Mutex<Config>>;

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        // Try to load from .env file in docker directory
        dotenv::from_path("../docker/.env").ok();
        
        // Also check for a config.toml file
        if let Ok(config_str) = std::fs::read_to_string("config.toml") {
            toml::from_str(&config_str).context("Failed to parse config.toml")
        } else {
            // Fall back to environment variables
            let database_url = Self::build_database_url();
            
            Ok(Config {
                database_url,
                gemini_api_key: std::env::var("GEMINI_API_KEY")
                    .unwrap_or_else(|_| "dummy_key".to_string()),
                anthropic_api_key: std::env::var("ANTHROPIC_API_KEY")
                    .unwrap_or_default(),
                server_host: std::env::var("SERVER_HOST")
                    .unwrap_or_else(|_| "127.0.0.1".to_string()),
                server_port: std::env::var("SERVER_PORT")
                    .unwrap_or_else(|_| "8081".to_string())
                    .parse()
                    .unwrap_or(8081),
                excel_file_path: std::env::var("EXCEL_FILE_PATH")
                    .unwrap_or_else(|_| "preferences/projects/DFC-ActiveProjects.xlsx".to_string()),
                site_favicon: std::env::var("SITE_FAVICON").ok(),
            })
        }
    }
    
    fn reload() -> anyhow::Result<Self> {
        log::info!("Reloading configuration from .env file");

        // Force reload of .env file from docker directory by reading it directly and setting env vars
        if let Ok(env_content) = std::fs::read_to_string("../docker/.env") {
            for line in env_content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();
                    std::env::set_var(key, value);
                }
            }
        }
        
        Self::from_env()
    }
    
    fn build_database_url() -> String {
        // First, try COMMONS component variables (more secure)
        if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(password)) = (
            std::env::var("COMMONS_HOST"),
            std::env::var("COMMONS_PORT"),
            std::env::var("COMMONS_NAME"),
            std::env::var("COMMONS_USER"),
            std::env::var("COMMONS_PASSWORD")
        ) {
            let ssl_mode = std::env::var("COMMONS_SSL_MODE").unwrap_or_else(|_| "require".to_string());
            format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}")
        } else if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(password)) = (
            std::env::var("DB_HOST"),
            std::env::var("DB_PORT"),
            std::env::var("DB_NAME"),
            std::env::var("DB_USER"),
            std::env::var("DB_PASSWORD")
        ) {
            // Fall back to generic DB_ variables
            let ssl_mode = std::env::var("DB_SSL_MODE").unwrap_or_else(|_| "require".to_string());
            format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}")
        } else {
            // Fall back to full DATABASE_URL
            std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://user:password@localhost/suitecrm".to_string())
        }
    }
}

// Persistent Claude Session Manager
#[derive(Debug)]
struct ClaudeSession {
    process: Option<Child>,
    session_start: u64,
    prompt_count: u32,
    total_input_tokens: u32,
    total_output_tokens: u32,
    last_usage: Option<serde_json::Value>,
}

impl ClaudeSession {
    fn new() -> Self {
        let start_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
            
        ClaudeSession {
            process: None,
            session_start: start_time,
            prompt_count: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            last_usage: None,
        }
    }
    
    fn is_active(&self) -> bool {
        self.process.is_some()
    }
    
    fn get_session_duration(&self) -> u64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now - self.session_start
    }
}

type ClaudeSessionManager = Arc<Mutex<ClaudeSession>>;

// CLI structure
#[derive(Parser)]
#[command(name = "suitecrm")]
#[command(about = "SuiteCRM with Gemini AI Integration", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the REST API server
    Serve,
    /// Initialize database schema
    InitDb,
}

// API State
struct ApiState {
    db: Option<Pool<Postgres>>,
    config: SharedConfig,
}

// Function to start watching .env file for changes
fn start_env_watcher(config: SharedConfig) -> anyhow::Result<()> {
    use notify::{Event, EventKind};
    
    let (tx, rx) = channel();
    let mut watcher = RecommendedWatcher::new(tx, NotifyConfig::default())?;
    
    // Watch the .env file in docker directory
    let env_path = Path::new("../docker/.env");
    if env_path.exists() {
        watcher.watch(env_path, RecursiveMode::NonRecursive)?;
        log::info!("Started watching .env file for changes");
        
        // Spawn a background thread to handle file change events
        let config_clone = config.clone();
        tokio::spawn(async move {
            loop {
                match rx.recv() {
                    Ok(event) => {
                        match event {
                            Ok(Event { kind: EventKind::Modify(_), paths, .. }) |
                            Ok(Event { kind: EventKind::Create(_), paths, .. }) => {
                                if paths.iter().any(|path| path.file_name() == Some(std::ffi::OsStr::new(".env"))) {
                                    log::info!(".env file changed, reloading configuration...");
                                    
                                    // Add a small delay to ensure file write is complete
                                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                    
                                    match Config::reload() {
                                        Ok(new_config) => {
                                            if let Ok(mut config_guard) = config_clone.lock() {
                                                *config_guard = new_config;
                                                log::info!("Configuration reloaded successfully");
                                            } else {
                                                log::error!("Failed to acquire config lock for reload");
                                            }
                                        }
                                        Err(e) => {
                                            log::error!("Failed to reload configuration: {e}");
                                        }
                                    }
                                }
                            }
                            Ok(Event { kind: EventKind::Remove(_), paths, .. }) => {
                                if paths.iter().any(|path| path.file_name() == Some(std::ffi::OsStr::new(".env"))) {
                                    log::warn!(".env file was removed");
                                }
                            }
                            _ => {} // Ignore other events
                        }
                    }
                    Err(e) => {
                        log::error!("File watcher error: {e}");
                        break;
                    }
                }
            }
        });
        
        // Keep the watcher alive by storing it
        std::mem::forget(watcher);
    } else {
        log::warn!("No .env file found to watch");
    }
    
    Ok(())
}

// Request/Response types for projects
#[derive(Debug, Serialize, Deserialize)]
struct CreateProjectRequest {
    name: String,
    description: Option<String>,
    status: Option<String>,
    estimated_start_date: Option<String>,
    estimated_end_date: Option<String>,
}

// Google Cloud project creation request
#[derive(Debug, Serialize, Deserialize)]
struct CreateGoogleProjectRequest {
    project_id: String,
    user_email: String,
    org_id: Option<String>,
    billing_id: Option<String>,
    service_key: String,
}

// Google OAuth verification request
#[derive(Debug, Serialize, Deserialize)]
struct GoogleAuthRequest {
    credential: String,
}

// Google OAuth verification response
#[derive(Debug, Serialize, Deserialize)]
struct GoogleAuthResponse {
    success: bool,
    name: String,
    email: String,
    picture: Option<String>,
}

// Google Sheets member data request
#[derive(Debug, Serialize, Deserialize)]
struct GoogleSheetsMemberRequest {
    data: std::collections::HashMap<String, String>,
    email: String,
    update_existing: bool,
}

// Google Cloud API structures
#[derive(Debug, Serialize, Deserialize)]
struct GoogleCloudProject {
    #[serde(rename = "projectId")]
    project_id: String,
    #[serde(rename = "projectNumber")]
    project_number: Option<String>,
    name: String,
    #[serde(rename = "lifecycleState")]
    lifecycle_state: Option<String>,
    #[serde(rename = "createTime")]
    create_time: Option<String>,
    parent: Option<GoogleCloudProjectParent>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleCloudProjectParent {
    #[serde(rename = "type")]
    parent_type: Option<String>,
    id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleCloudProjectsResponse {
    projects: Option<Vec<GoogleCloudProject>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Serialize)]
struct TableInfo {
    name: String,
    row_count: i64,
}

#[derive(Serialize)]
struct DatabaseResponse {
    success: bool,
    message: Option<String>,
    error: Option<String>,
    data: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct TableInfoDetailed {
    name: String,
    rows: Option<i64>,
    description: Option<String>,
}

#[derive(Serialize)]
struct ConnectionInfo {
    server_version: String,
    database_name: String,
    current_user: String,
    connection_count: i64,
}

#[derive(Deserialize)]
struct QueryRequest {
    query: String,
}

#[derive(Deserialize)]
struct TableRowsRequest {
    table: String,
    connection: Option<String>,
    page: Option<i64>,
    size: Option<i64>,
    sort_field: Option<String>,
    sort_dir: Option<String>,
}

#[derive(Serialize, Clone)]
struct EnvDatabaseConfig {
    server: String,
    database: String,
    username: String,
    port: u16,
    ssl: bool,
}

/// Maps provider ID → env var name. Single source of truth for all key lookups.
const PROVIDER_ENV_VARS: &[(&str, &str)] = &[
    ("google",     "GEMINI_API_KEY"),
    ("anthropic",  "ANTHROPIC_API_KEY"),
    ("openai",     "OPENAI_API_KEY"),
    ("xai",        "XAI_API_KEY"),
    ("groq",       "GROQ_API_KEY"),
    ("together",   "TOGETHER_API_KEY"),
    ("fireworks",  "FIREWORKS_API_KEY"),
    ("mistral",    "MISTRAL_API_KEY"),
    ("perplexity", "PERPLEXITY_API_KEY"),
    ("deepseek",   "DEEPSEEK_API_KEY"),
    ("discord",    "DISCORD_BOT_TOKEN"),
];

fn env_keys_present() -> Vec<String> {
    PROVIDER_ENV_VARS.iter()
        .filter(|(_, var)| {
            std::env::var(var).map_or(false, |v| !v.is_empty() && v != "dummy_key")
        })
        .map(|(id, _)| id.to_string())
        .collect()
}

#[derive(Serialize)]
struct EnvConfigResponse {
    database: Option<EnvDatabaseConfig>,
    database_connections: Vec<DatabaseConnection>,
    env_keys_present: Vec<String>,
    google_client_id: Option<String>,
    google_project_id: Option<String>,
    google_user_email: Option<String>,
    google_org_id: Option<String>,
    google_billing_id: Option<String>,
    google_service_key: Option<String>,
    better_auth_secret_present: bool,
    better_auth_base_url: Option<String>,
    better_auth_allowed_origins: Option<String>,
}

#[derive(Serialize)]
struct DatabaseConnection {
    name: String,
    display_name: String,
    config: EnvDatabaseConfig,
}

#[derive(Deserialize)]
struct SaveEnvConfigRequest {
    #[serde(rename = "GEMINI_API_KEY")]
    gemini_api_key: Option<String>,
    google_project_id: Option<String>,
    google_user_email: Option<String>,
    google_org_id: Option<String>,
    google_billing_id: Option<String>,
    google_service_key: Option<String>,
}

#[derive(Deserialize)]
struct CreateEnvConfigRequest {
    content: String,
}

#[derive(Deserialize)]
struct FetchCsvRequest {
    url: String,
}

#[derive(Deserialize)]
struct SaveCsvRequest {
    filename: String,
    content: String,
}

// GitHub token endpoint - returns token from docker/.env if available
async fn get_github_token() -> Result<HttpResponse> {
    // Read GITHUB_PERSONAL_ACCESS_TOKEN from environment
    let token = std::env::var("GITHUB_PERSONAL_ACCESS_TOKEN").ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "token": token
    })))
}

// GitHub CLI status endpoint - checks local gh install/auth state
async fn get_github_cli_status() -> Result<HttpResponse> {
    let version_output = Command::new("gh").arg("--version").output();

    let (installed, version, install_error) = match version_output {
        Ok(output) if output.status.success() => {
            let version_text = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            (true, Some(version_text), None)
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            (
                false,
                None,
                Some(if stderr.is_empty() {
                    "gh --version returned non-zero status".to_string()
                } else {
                    stderr
                }),
            )
        }
        Err(err) => (false, None, Some(err.to_string())),
    };

    if !installed {
        return Ok(HttpResponse::Ok().json(json!({
            "installed": false,
            "authenticated": false,
            "version": version,
            "install_error": install_error,
            "auth_status": "GitHub CLI not available"
        })));
    }

    let auth_output = Command::new("gh").args(["auth", "status"]).output();
    let (authenticated, auth_status, auth_error) = match auth_output {
        Ok(output) => {
            let status_ok = output.status.success();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let details = if !stderr.is_empty() { stderr } else { stdout };
            (status_ok, details, None)
        }
        Err(err) => (false, String::new(), Some(err.to_string())),
    };

    Ok(HttpResponse::Ok().json(json!({
        "installed": true,
        "authenticated": authenticated,
        "version": version,
        "auth_status": auth_status,
        "install_error": install_error,
        "auth_error": auth_error
    })))
}

// Health check endpoint
async fn health_check(data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    match &data.db {
        Some(db) => {
            match sqlx::query("SELECT 1").fetch_one(db).await {
                Ok(_) => Ok(HttpResponse::Ok().json(json!({
                    "status": "healthy",
                    "database_connected": true
                }))),
                Err(e) => Ok(HttpResponse::Ok().json(json!({
                    "status": "unhealthy",
                    "database_connected": false,
                    "error": e.to_string()
                }))),
            }
        }
        None => Ok(HttpResponse::Ok().json(json!({
            "status": "healthy",
            "database_connected": false,
            "message": "Server running without database connection"
        })))
    }
}

// Get current configuration from shared state
async fn get_current_config(data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    let (server_host, server_port, site_favicon) = {
        let config_guard = data.config.lock().unwrap();
        (config_guard.server_host.clone(), config_guard.server_port, config_guard.site_favicon.clone())
    };
    let config_json = json!({
        "server_host": server_host,
        "server_port": server_port,
        "site_favicon": site_favicon,
        "env_keys_present": env_keys_present()
    });

    Ok(HttpResponse::Ok().json(config_json))
}

// Get environment configuration
async fn get_env_config() -> Result<HttpResponse> {
    let mut database_config = None;
    let mut database_connections = Vec::new();
    
    // Helper function to build config from components
    let build_config_from_components = |prefix: &str| -> Option<(String, EnvDatabaseConfig)> {
        let host_key = format!("{prefix}_HOST");
        let port_key = format!("{prefix}_PORT");
        let name_key = format!("{prefix}_NAME");
        let user_key = format!("{prefix}_USER");
        let password_key = format!("{prefix}_PASSWORD");
        let ssl_key = format!("{prefix}_SSL_MODE");
        
        if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(_password)) = (
            std::env::var(&host_key),
            std::env::var(&port_key),
            std::env::var(&name_key),
            std::env::var(&user_key),
            std::env::var(&password_key)
        ) {
            let ssl_mode = std::env::var(&ssl_key).unwrap_or_else(|_| "require".to_string());
            let port_num: u16 = port.parse().unwrap_or(5432);
            let ssl = ssl_mode == "require";
            
            let config = EnvDatabaseConfig {
                server: format!("{host}:{port_num}"),
                database: name.clone(),
                username: user.clone(),
                port: port_num,
                ssl,
            };
            
            let display_name = match prefix {
                "COMMONS" => "Member Database (Default)".to_string(),
                "EXIOBASE" => "Industry Database".to_string(),
                "LOCATIONS" => "Locations Database".to_string(),
                _ => format!("{} Database", prefix.replace('_', " ")),
            };
            
            Some((display_name, config))
        } else {
            None
        }
    };
    
    // Check for component-based configurations first
    let component_prefixes = ["EXIOBASE", "COMMONS", "LOCATIONS", "DB"];
    for prefix in component_prefixes.iter() {
        if let Some((display_name, config)) = build_config_from_components(prefix) {
            // Set COMMONS as the default database config
            if *prefix == "COMMONS" {
                database_config = Some(config.clone());
            }
            
            database_connections.push(DatabaseConnection {
                name: prefix.to_string(),
                display_name,
                config,
            });
        }
    }
    
    // Scan for all database URLs in environment variables (legacy support)
    for (key, value) in std::env::vars() {
        if key.ends_with("_URL") && value.starts_with("postgres://") {
            if let Ok(url) = Url::parse(&value) {
                let server = format!("{}:{}", 
                    url.host_str().unwrap_or("unknown"), 
                    url.port().unwrap_or(5432)
                );
                let database = url.path().trim_start_matches('/').to_string();
                let username = url.username().to_string();
                let ssl = value.contains("sslmode=require");
                
                let config = EnvDatabaseConfig {
                    server,
                    database,
                    username,
                    port: url.port().unwrap_or(5432),
                    ssl,
                };
                
                // Set the default database (DATABASE_URL) as the main config
                if key == "DATABASE_URL" {
                    database_config = Some(config.clone());
                }
                
                // Add to connections list with display name
                let display_name = match key.as_str() {
                    "DATABASE_URL" => "Member Database (Default)".to_string(),
                    "EXIOBASE_URL" => "Industry Database".to_string(),
                    _ => {
                        let name = key.replace("_URL", "").replace("_", " ");
                        format!("{} Database", name.split_whitespace()
                            .map(|word| {
                                let mut chars = word.chars();
                                match chars.next() {
                                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                                    None => String::new(),
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(" "))
                    }
                };
                
                database_connections.push(DatabaseConnection {
                    name: key,
                    display_name,
                    config,
                });
            }
        }
    }
    
    // Get Google configuration values
    let google_client_id = std::env::var("GOOGLE_CLIENT_ID").ok();
    let google_project_id = std::env::var("GOOGLE_PROJECT_ID").ok();
    let google_user_email = std::env::var("GOOGLE_USER_EMAIL").ok();
    let google_org_id = std::env::var("GOOGLE_ORG_ID").ok();
    let google_billing_id = std::env::var("GOOGLE_BILLING_ID").ok();
    let google_service_key = std::env::var("GOOGLE_SERVICE_KEY").ok();

    // Better Auth configuration
    let better_auth_secret_present = if let Ok(secret) = std::env::var("BETTER_AUTH_SECRET") {
        secret.len() >= 32 && secret != "CHANGE_ME_GENERATE_WITH_openssl_rand_base64_32"
    } else {
        false
    };
    let better_auth_base_url = std::env::var("BASE_URL").ok();
    let better_auth_allowed_origins = std::env::var("ALLOWED_ORIGINS").ok();

    Ok(HttpResponse::Ok().json(EnvConfigResponse {
        database: database_config,
        database_connections,
        env_keys_present: env_keys_present(),
        google_client_id,
        google_project_id,
        google_user_email,
        google_org_id,
        google_billing_id,
        google_service_key,
        better_auth_secret_present,
        better_auth_base_url,
        better_auth_allowed_origins,
    }))
}

// Restart server endpoint (for development)
async fn restart_server() -> Result<HttpResponse> {
    // In a production environment, you might want to add authentication here
    
    // For development, just exit and let the user restart manually
    // This is safer and more reliable than trying to auto-restart
    tokio::spawn(async {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        std::process::exit(0); // Clean exit
    });
    
    Ok(HttpResponse::Ok().json(json!({
        "message": "Server shutdown initiated. Please restart manually with 'cargo run serve'",
        "status": "success"
    })))
}

// Stop local web server on port 8887 (development helper)
async fn stop_webroot_server() -> Result<HttpResponse> {
    #[cfg(target_family = "unix")]
    {
        let output = Command::new("sh")
            .arg("-c")
            .arg("lsof -ti:8887 | xargs kill -9")
            .output();

        match output {
            Ok(result) if result.status.success() => {
                return Ok(HttpResponse::Ok().json(json!({
                    "message": "Stop signal sent to port 8887"
                })));
            }
            Ok(result) => {
                let stderr = String::from_utf8_lossy(&result.stderr).to_string();
                return Ok(HttpResponse::BadRequest().json(json!({
                    "error": "Failed to stop server on port 8887",
                    "details": stderr
                })));
            }
            Err(err) => {
                return Ok(HttpResponse::InternalServerError().json(json!({
                    "error": "Failed to run stop command",
                    "details": err.to_string()
                })));
            }
        }
    }

    #[cfg(target_family = "windows")]
    {
        Ok(HttpResponse::BadRequest().json(json!({
            "error": "Stop command not supported on Windows"
        })))
    }
}

// Save environment configuration to .env file
async fn save_env_config(req: web::Json<SaveEnvConfigRequest>) -> Result<HttpResponse> {
    use std::fs::OpenOptions;
    use std::io::{BufRead, BufReader, Write};

    let env_path = "../docker/.env";
    let mut env_lines = Vec::new();
    let mut updated_keys = std::collections::HashSet::<String>::new();

    // Read existing .env file from docker directory if it exists
    if let Ok(file) = std::fs::File::open(env_path) {
        let reader = BufReader::new(file);
        for line in reader.lines().map_while(Result::ok) {
            env_lines.push(line);
        }
    }
    
    // Helper function to update or add environment variable
    let update_env_var = |env_lines: &mut Vec<String>, updated_keys: &mut std::collections::HashSet<String>, key: &str, value: &Option<String>| {
        if let Some(val) = value {
            if !val.is_empty() {
                let new_line = format!("{key}={val}");
                
                // Find and update existing key, or mark for addition
                let mut found = false;
                for line in env_lines.iter_mut() {
                    // Skip empty lines and comments
                    if line.trim().is_empty() || line.trim().starts_with('#') {
                        continue;
                    }
                    
                    // Check if line starts with the key followed by = (with optional whitespace)
                    let line_trimmed = line.trim();
                    if line_trimmed.starts_with(&format!("{key}=")) || 
                       line_trimmed.starts_with(&format!("{key} =")) {
                        *line = new_line.clone();
                        found = true;
                        break;
                    }
                }
                
                if !found {
                    env_lines.push(new_line);
                }
                updated_keys.insert(key.to_string());
            }
        }
    };
    
    // Update or add new values
    update_env_var(&mut env_lines, &mut updated_keys, "GEMINI_API_KEY", &req.gemini_api_key);
    update_env_var(&mut env_lines, &mut updated_keys, "GOOGLE_PROJECT_ID", &req.google_project_id);
    update_env_var(&mut env_lines, &mut updated_keys, "GOOGLE_USER_EMAIL", &req.google_user_email);
    update_env_var(&mut env_lines, &mut updated_keys, "GOOGLE_ORG_ID", &req.google_org_id);
    update_env_var(&mut env_lines, &mut updated_keys, "GOOGLE_BILLING_ID", &req.google_billing_id);
    update_env_var(&mut env_lines, &mut updated_keys, "GOOGLE_SERVICE_KEY", &req.google_service_key);
    
    // Write back to .env file
    match OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(env_path)
    {
        Ok(mut file) => {
            for line in env_lines {
                writeln!(file, "{line}").map_err(|e| {
                    actix_web::error::ErrorInternalServerError(format!("Failed to write to .env file: {e}"))
                })?;
            }
            
            // Update environment variables in current process
            let set_env_var = |key: &str, value: &Option<String>| {
                if let Some(val) = value {
                    if !val.is_empty() {
                        std::env::set_var(key, val);
                    }
                }
            };
            
            set_env_var("GEMINI_API_KEY", &req.gemini_api_key);
            set_env_var("GOOGLE_PROJECT_ID", &req.google_project_id);
            set_env_var("GOOGLE_USER_EMAIL", &req.google_user_email);
            set_env_var("GOOGLE_ORG_ID", &req.google_org_id);
            set_env_var("GOOGLE_BILLING_ID", &req.google_billing_id);
            set_env_var("GOOGLE_SERVICE_KEY", &req.google_service_key);
            
            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "message": "Configuration saved to .env file",
                "updated_keys": updated_keys.into_iter().collect::<Vec<_>>()
            })))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "success": false,
                "error": format!("Failed to write .env file: {e}")
            })))
        }
    }
}

// Create .env file from .env.example content
async fn create_env_config(req: web::Json<CreateEnvConfigRequest>) -> Result<HttpResponse> {
    use std::fs;

    // Check if .env file already exists in docker directory
    if std::path::Path::new("../docker/.env").exists() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": ".env file already exists"
        })));
    }

    // Write the content to .env file in docker directory
    match fs::write("../docker/.env", &req.content) {
        Ok(_) => {
            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "message": ".env file created successfully from .env.example template"
            })))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "success": false,
                "error": format!("Failed to create .env file: {e}")
            })))
        }
    }
}

// Save CSV file to projects directory
async fn save_csv_file(req: web::Json<SaveCsvRequest>) -> Result<HttpResponse> {
    use std::fs;
    use std::path::Path;
    
    // Validate filename - only allow lists.csv for security
    if req.filename != "lists.csv" {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Invalid filename: only lists.csv is allowed"
        })));
    }
    
    // Use existing projects directory
    let projects_dir = Path::new("projects");
    
    // Write CSV content to file
    let file_path = projects_dir.join(&req.filename);
    match fs::write(&file_path, &req.content) {
        Ok(_) => {
            println!("Successfully saved CSV to: {}", file_path.display());
            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "message": "CSV file saved successfully",
                "filename": req.filename,
                "path": format!("projects/{}", req.filename),
                "size": req.content.len(),
                "timestamp": chrono::Utc::now().to_rfc3339()
            })))
        }
        Err(e) => {
            eprintln!("Failed to save CSV file: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "success": false,
                "error": format!("Failed to save CSV file: {e}")
            })))
        }
    }
}

// Create Google Cloud project via API
async fn create_google_project(req: web::Json<CreateGoogleProjectRequest>) -> Result<HttpResponse> {
    // Validate required fields
    if req.project_id.is_empty() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Project ID is required"
        })));
    }
    
    if req.user_email.is_empty() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "User email is required"
        })));
    }
    
    if req.service_key.is_empty() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Service account key is required for API access"
        })));
    }
    
    // Validate service key is valid JSON
    if let Err(_) = serde_json::from_str::<serde_json::Value>(&req.service_key) {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Service account key must be valid JSON",
            "help": {
                "title": "How to Get Your Google Service Account Key",
                "style": "info", // This will trigger light blue background in frontend
                "google_console_url": "https://console.cloud.google.com/iam-admin/serviceaccounts",
                "steps": [
                    "1. Go to Google Cloud Console → IAM & Admin → Service Accounts",
                    "2. Click 'Create Service Account' or select existing one", 
                    "3. Grant 'Cloud Resource Manager Admin' role (required for project creation)",
                    "4. Click 'Keys' tab → 'Add Key' → 'Create New Key'",
                    "5. Choose 'JSON' format and download the file",
                    "6. Copy the entire JSON content into the 'Service Account Key' field above"
                ],
                "billing_info": {
                    "required_for": "Creating new Google Cloud projects via API",
                    "not_required_for": "Accessing Google Meet/Calendar APIs on existing projects",
                    "note": "For Google Meetup participant feeds, billing is typically not required unless you exceed free tier limits"
                },
                "json_format_example": "Should start with: {\"type\":\"service_account\",\"project_id\":\"...\",\"private_key_id\":\"...\"}"
            }
        })));
    }
    
    // For now, return a placeholder response indicating the feature is not fully implemented
    // In a real implementation, this would:
    // 1. Parse the service account key
    // 2. Authenticate with Google Cloud Resource Manager API
    // 3. Create the project using the Google Cloud API
    // 4. Set up billing if billing_id is provided
    // 5. Add the user email to the project IAM
    
    Ok(HttpResponse::Ok().json(json!({
        "success": false,
        "error": "Google Cloud Project API integration is not yet implemented. Please use the manual method for now.",
        "message": "To manually create the project, click 'Via Google Page' and follow the instructions.",
        "troubleshooting": {
            "manual_steps": [
                "1. Click 'Via Google Page' button",
                "2. Follow the Google Cloud Console instructions",
                "3. Use the provided project ID and billing information",
                "4. Return here and click 'Project Created' when done"
            ],
            "api_implementation_needed": [
                "Google Cloud Resource Manager API integration",
                "Service account authentication",
                "Project creation and billing setup",
                "IAM role assignment"
            ]
        }
    })))
}

// Multi-Provider OAuth Authentication Handlers
// Supports Google, GitHub, LinkedIn, Microsoft, and Facebook

async fn oauth_provider_url(
    provider: web::Path<String>,
) -> Result<HttpResponse> {
    let provider_name = provider.into_inner();
    
    // Load OAuth configuration
    let oauth_config = match OAuthConfig::load() {
        Ok(config) => config,
        Err(e) => {
            return Ok(HttpResponse::InternalServerError().json(json!({
                "error": "OAuth configuration error",
                "message": format!("Failed to load OAuth config: {}", e)
            })));
        }
    };
    
    // Get provider configuration
    let provider_config = match oauth_config.get_provider(&provider_name) {
        Some(config) => config,
        None => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": "Provider not configured",
                "message": format!("OAuth provider '{}' not found", provider_name)
            })));
        }
    };
    
    // Handle demo provider specially
    if provider_name == "demo" {
        return Ok(HttpResponse::Ok().json(json!({
            "auth_url": "/api/auth/demo/login",
            "state": "demo_state"
        })));
    }
    
    // Check if provider credentials are configured
    if provider_config.client_id.contains("your-") || provider_config.client_secret.contains("your-") {
        return Ok(HttpResponse::ServiceUnavailable().json(json!({
            "error": "Provider not configured",
            "message": format!("{} OAuth credentials not configured", provider_config.name),
            "setup_instructions": format!("Set {}_CLIENT_ID and {}_CLIENT_SECRET environment variables", 
                provider_name.to_uppercase(), provider_name.to_uppercase())
        })));
    }
    
    // Generate OAuth URL (simplified implementation)
    let redirect_uri = oauth_config.get_redirect_uri(&provider_name);
    let state = uuid::Uuid::new_v4().to_string();
    let scopes = provider_config.scopes.join(" ");
    
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type={}&scope={}&state={}",
        provider_config.authorization_endpoint,
        urlencoding::encode(&provider_config.client_id),
        urlencoding::encode(&redirect_uri),
        provider_config.response_type,
        urlencoding::encode(&scopes),
        state
    );
    
    Ok(HttpResponse::Ok().json(OAuthUrlResponse {
        auth_url,
        state,
    }))
}

async fn oauth_provider_callback(
    provider: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    let provider_name = provider.into_inner();
    let code = match query.get("code") {
        Some(code) => code,
        None => {
            return Ok(HttpResponse::Found()
                .append_header(("Location", "http://localhost:8887/team?auth=error&message=no_code"))
                .finish());
        }
    };
    
    // For now, create a demo user session for any successful OAuth callback
    // In production, this would exchange the code for a token and fetch user info
    let user_session = UserSession::new(
        format!("{}_user_{}", provider_name, &code[..8]),
        format!("user@{}.com", provider_name),
        format!("{} User", provider_name.to_uppercase()),
        None,
        provider_name,
    );
    
    // In a real implementation, you would:
    // 1. Exchange authorization code for access token
    // 2. Fetch user information from provider
    // 3. Store/update user in database
    // 4. Create session
    
    Ok(HttpResponse::Found()
        .append_header(("Location", "http://localhost:8887/team?auth=success#account/preferences"))
        .finish())
}

async fn demo_login() -> Result<HttpResponse> {
    // Load demo user from configuration
    let oauth_config = match OAuthConfig::load() {
        Ok(config) => config,
        Err(_) => {
            return Ok(HttpResponse::Ok().json(json!({
                "success": false,
                "error": "OAuth configuration not available"
            })));
        }
    };
    
    let demo_user = oauth_config
        .get_provider("demo")
        .and_then(|p| p.demo_user.as_ref());
    
    let user_session = if let Some(demo) = demo_user {
        UserSession::new(
            demo.id.clone(),
            demo.email.clone(),
            demo.name.clone(),
            demo.picture.clone(),
            "demo".to_string(),
        )
    } else {
        UserSession::new(
            "demo123".to_string(),
            "demo@localhost".to_string(),
            "Demo User".to_string(),
            None,
            "demo".to_string(),
        )
    };
    
    Ok(HttpResponse::Ok().json(json!({
        "success": true,
        "user": user_session
    })))
}

async fn get_current_user() -> Result<HttpResponse> {
    // For now, return not authenticated
    // In a real implementation, this would check the session
    Ok(HttpResponse::Ok().json(json!({
        "success": false,
        "error": "Not authenticated"
    })))
}

async fn logout_user() -> Result<HttpResponse> {
    // For now, just return success
    // In a real implementation, this would clear the session
    Ok(HttpResponse::Ok().json(json!({
        "success": true
    })))
}

// Google Cloud projects handler - fetches user's Google Cloud projects
async fn get_google_cloud_projects() -> Result<HttpResponse> {
    // TODO: In a real implementation, this would:
    // 1. Get the user's OAuth token from the session
    // 2. Make an authenticated request to Google Cloud Resource Manager API
    // 3. Return the list of projects
    
    // For now, return a mock response indicating authentication is needed
    Ok(HttpResponse::Unauthorized().json(json!({
        "success": false,
        "error": "Authentication required",
        "message": "Please connect your Google account first",
        "auth_url": "/api/auth/google/url"
    })))
}

// Google Cloud projects handler with mock data (for development)
async fn get_google_cloud_projects_mock() -> Result<HttpResponse> {
    // Mock data for development/testing
    let mock_projects = vec![
        GoogleCloudProject {
            project_id: "my-test-project-123".to_string(),
            project_number: Some("123456789".to_string()),
            name: "My Test Project".to_string(),
            lifecycle_state: Some("ACTIVE".to_string()),
            create_time: Some("2024-01-15T10:30:00Z".to_string()),
            parent: Some(GoogleCloudProjectParent {
                parent_type: Some("organization".to_string()),
                id: Some("123456789".to_string()),
            }),
        },
        GoogleCloudProject {
            project_id: "discord-bot-project".to_string(),
            project_number: Some("987654321".to_string()),
            name: "Discord Bot API".to_string(),
            lifecycle_state: Some("ACTIVE".to_string()),
            create_time: Some("2024-02-20T14:45:00Z".to_string()),
            parent: None,
        },
    ];
    
    Ok(HttpResponse::Ok().json(json!({
        "success": true,
        "projects": mock_projects,
        "total": mock_projects.len()
    })))
}

// Legacy Google OAuth verification handler (kept for compatibility)
async fn verify_google_auth(_req: web::Json<GoogleAuthRequest>) -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({
        "success": false,
        "error": "Deprecated endpoint",
        "message": "Please use the new OAuth flow: /api/auth/{provider}/url",
        "providers": ["google", "github", "linkedin", "microsoft", "facebook", "discord"]
    })))
}

// Google Sheets Helper Functions (Placeholder implementations)
// TODO: Complete the Google Sheets API integration by resolving dependency version conflicts

async fn get_sheets_config_data() -> anyhow::Result<serde_json::Value> {
    let config_path = "admin/google/form/config.yaml";
    let config_content = std::fs::read_to_string(config_path)
        .context("Failed to read sheets config file")?;

    let config: serde_json::Value = serde_yaml::from_str(&config_content)
        .context("Failed to parse sheets config YAML")?;

    Ok(config)
}

// Placeholder function - TODO: Implement with actual Google Sheets API
async fn validate_sheets_credentials() -> anyhow::Result<bool> {
    // Check if service account key exists and is valid JSON
    let service_key_json = std::env::var("GOOGLE_SERVICE_KEY")
        .context("GOOGLE_SERVICE_KEY not found in environment")?;
    
    // Try to parse as JSON to validate format
    let _service_account_key: serde_json::Value = serde_json::from_str(&service_key_json)
        .context("Failed to parse service account key JSON")?;
    
    // TODO: Actually validate credentials with Google API
    Ok(true)
}

// Get Google Sheets configuration
async fn get_sheets_config() -> Result<HttpResponse> {
    // Try to read configuration from file
    let config_path = "admin/google/form/config.yaml";

    match std::fs::read_to_string(config_path) {
        Ok(config_content) => {
            match serde_yaml::from_str::<serde_json::Value>(&config_content) {
                Ok(config) => {
                    Ok(HttpResponse::Ok().json(json!({
                        "success": true,
                        "config": config
                    })))
                }
                Err(e) => {
                    Ok(HttpResponse::InternalServerError().json(json!({
                        "success": false,
                        "error": format!("Failed to parse configuration: {}", e)
                    })))
                }
            }
        }
        Err(_) => {
            // Return default configuration
            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "config": {
                    "GoogleSheets": {
                        "spreadsheetId": "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID",
                        "worksheetName": "Members",
                        "headerRow": 1,
                        "dataStartRow": 2
                    },
                    "OAuth": {
                        "clientId": "REPLACE_WITH_YOUR_GOOGLE_OAUTH_CLIENT_ID"
                    },
                    "Appearance": {
                        "title": "Member Registration",
                        "subtitle": "Join our community of developers and contributors working on sustainable impact projects",
                        "primaryColor": "#3B82F6",
                        "accentColor": "#10B981"
                    },
                    "Messages": {
                        "welcomeNew": "Welcome! Please fill out the registration form to join our community of developers working on sustainable impact projects.",
                        "welcomeReturning": "Welcome back! Your existing information has been loaded. Please review and update any details as needed."
                    },
                    "Behavior": {
                        "allowDuplicates": false,
                        "requireGithub": true,
                        "showProgress": true,
                        "enablePreview": true
                    },
                    "Links": {
                        "membersPage": "https://model.earth/community/members",
                        "projectsPage": "https://model.earth/projects"
                    },
                    "message": "Default configuration loaded. Please update config.yaml with your Google Sheets details."
                }
            })))
        }
    }
}

// Save Google Sheets configuration
async fn save_sheets_config(req: web::Json<serde_json::Value>) -> Result<HttpResponse> {
    let config_path = "admin/google/form/config.yaml";

    // Create directory if it doesn't exist
    if let Some(parent) = std::path::Path::new(config_path).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return Ok(HttpResponse::InternalServerError().json(json!({
                "success": false,
                "error": format!("Failed to create config directory: {}", e)
            })));
        }
    }

    // Serialize to YAML
    match serde_yaml::to_string(&*req) {
        Ok(config_yaml) => {
            match std::fs::write(config_path, config_yaml) {
                Ok(_) => {
                    Ok(HttpResponse::Ok().json(json!({
                        "success": true,
                        "message": "Form configuration saved successfully to config.yaml"
                    })))
                }
                Err(e) => {
                    Ok(HttpResponse::InternalServerError().json(json!({
                        "success": false,
                        "error": format!("Failed to write configuration file: {}", e)
                    })))
                }
            }
        }
        Err(e) => {
            Ok(HttpResponse::BadRequest().json(json!({
                "success": false,
                "error": format!("Invalid JSON configuration: {}", e)
            })))
        }
    }
}

// Get member data by email from Google Sheets
async fn get_member_by_email(path: web::Path<String>) -> Result<HttpResponse> {
    let email = path.into_inner();
    
    // Get configuration
    let config = match get_sheets_config_data().await {
        Ok(config) => config,
        Err(e) => {
            return Ok(HttpResponse::InternalServerError().json(json!({
                "success": false,
                "error": format!("Failed to load sheets configuration: {}", e),
                "email": email
            })));
        }
    };
    
    // Extract sheet details from config
    let spreadsheet_id = config["googleSheets"]["spreadsheetId"]
        .as_str()
        .unwrap_or("REPLACE_WITH_YOUR_GOOGLE_SHEET_ID");
    
    if spreadsheet_id == "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID" {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Google Sheets not configured. Please update spreadsheetId in config.json",
            "email": email,
            "setup_required": {
                "steps": [
                    "1. Create a Google Sheet with member data",
                    "2. Add the spreadsheet ID to admin/google/form/config.json",
                    "3. Add your Google Service Account Key to .env as GOOGLE_SERVICE_KEY",
                    "4. The backend will automatically connect to your sheet"
                ],
                "config_file": "admin/google/form/config.json",
                "env_variable": "GOOGLE_SERVICE_KEY"
            }
        })));
    }
    
    // Check if credentials are configured
    match validate_sheets_credentials().await {
        Ok(_) => {
            // TODO: Replace with actual Google Sheets API call
            // For now, return a message indicating the integration is ready but not fully implemented
            Ok(HttpResponse::Ok().json(json!({
                "success": false,
                "error": "Google Sheets API integration ready but not fully implemented",
                "email": email,
                "message": "Configuration validated. Waiting for Google Sheets API implementation to complete.",
                "status": "credentials_valid_api_pending",
                "next_steps": [
                    "Resolve Google API dependency version conflicts",
                    "Complete the find_member_row_by_email implementation",
                    "Test with real Google Sheets data"
                ]
            })))
        }
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "success": false,
                "error": format!("Google Sheets credentials invalid: {}", e),
                "email": email,
                "setup_required": {
                    "env_variable": "GOOGLE_SERVICE_KEY",
                    "format": "Valid JSON service account key from Google Cloud Console"
                }
            })));
        }
    }
}

// Create or update member data in Google Sheets
async fn save_member_data(req: web::Json<GoogleSheetsMemberRequest>) -> Result<HttpResponse> {
    // Get configuration
    let config = match get_sheets_config_data().await {
        Ok(config) => config,
        Err(e) => {
            return Ok(HttpResponse::InternalServerError().json(json!({
                "success": false,
                "error": format!("Failed to load sheets configuration: {}", e),
                "email": req.email
            })));
        }
    };
    
    // Extract sheet details from config
    let spreadsheet_id = config["googleSheets"]["spreadsheetId"]
        .as_str()
        .unwrap_or("REPLACE_WITH_YOUR_GOOGLE_SHEET_ID");
    
    if spreadsheet_id == "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID" {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Google Sheets not configured. Please update spreadsheetId in config.json",
            "email": req.email,
            "setup_required": {
                "steps": [
                    "1. Create a Google Sheet with member data columns",
                    "2. Add the spreadsheet ID to admin/google/form/config.json",
                    "3. Add your Google Service Account Key to .env as GOOGLE_SERVICE_KEY",
                    "4. The backend will automatically save data to your sheet"
                ],
                "config_file": "admin/google/form/config.json",
                "env_variable": "GOOGLE_SERVICE_KEY"
            }
        })));
    }
    
    // Check if credentials are configured
    match validate_sheets_credentials().await {
        Ok(_) => {
            // TODO: Replace with actual Google Sheets API call
            // For now, simulate success to allow form testing
            Ok(HttpResponse::Ok().json(json!({
                "success": false,
                "error": "Google Sheets API integration ready but not fully implemented",
                "email": req.email,
                "update_existing": req.update_existing,
                "message": "Form data received and validated. Google Sheets integration pending.",
                "status": "credentials_valid_api_pending",
                "data_received": {
                    "fields_count": req.data.len(),
                    "sample_fields": req.data.keys().take(5).collect::<Vec<_>>(),
                    "operation": if req.update_existing { "update" } else { "create" }
                },
                "next_steps": [
                    "Resolve Google API dependency version conflicts",
                    "Complete the append_member_row/update_member_row implementations",
                    "Test with real Google Sheets data"
                ]
            })))
        }
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "success": false,
                "error": format!("Google Sheets credentials invalid: {}", e),
                "email": req.email,
                "setup_required": {
                    "env_variable": "GOOGLE_SERVICE_KEY",
                    "format": "Valid JSON service account key from Google Cloud Console"
                }
            })));
        }
    }
}

// Fetch CSV data from external URL (proxy for CORS)
async fn fetch_csv(req: web::Json<FetchCsvRequest>) -> Result<HttpResponse> {
    let url = &req.url;

    // Validate URL uses HTTPS for security
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Ok(HttpResponse::BadRequest().json(json!({
            "success": false,
            "error": "Invalid URL protocol - must be HTTP or HTTPS"
        })));
    }
    
    match reqwest::get(url).await {
        Ok(response) => {
            if response.status().is_success() {
                match response.text().await {
                    Ok(csv_data) => {
                        if csv_data.trim().is_empty() {
                            Ok(HttpResponse::Ok().json(json!({
                                "success": false,
                                "error": "The spreadsheet appears to be empty or not publicly accessible"
                            })))
                        } else {
                            Ok(HttpResponse::Ok().json(json!({
                                "success": true,
                                "data": csv_data
                            })))
                        }
                    }
                    Err(e) => {
                        Ok(HttpResponse::Ok().json(json!({
                            "success": false,
                            "error": format!("Failed to read response data: {e}")
                        })))
                    }
                }
            } else {
                Ok(HttpResponse::Ok().json(json!({
                    "success": false,
                    "error": format!("HTTP {}: The spreadsheet may not be publicly accessible or the URL is incorrect", response.status())
                })))
            }
        }
        Err(e) => {
            Ok(HttpResponse::Ok().json(json!({
                "success": false,
                "error": format!("Network error: {e}")
            })))
        }
    }
}





#[derive(Debug, Deserialize)]
struct ProxyRequest {
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
struct ProxyResponse {
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}





// Analyze data with Claude Code CLI
async fn get_recommendations_handler(req: web::Json<RecommendationRequest>, data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    let excel_file_path = {
        let config_guard = data.config.lock().unwrap();
        config_guard.excel_file_path.clone()
    };
    match recommendations::get_recommendations(&req.preferences, &excel_file_path) {
        Ok(projects) => Ok(HttpResponse::Ok().json(projects)),
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({ "error": e.to_string() }))),
    }
}




// Proxy external requests to bypass CORS restrictions
async fn proxy_external_request(req: web::Json<ProxyRequest>) -> Result<HttpResponse> {
    println!("Proxy request to: {}", req.url);
    
    // Create HTTP client
    let client = reqwest::Client::new();
    
    // Build request
    let mut request_builder = match req.method.as_deref().unwrap_or("GET") {
        "POST" => client.post(&req.url),
        "PUT" => client.put(&req.url),
        "DELETE" => client.delete(&req.url),
        "PATCH" => client.patch(&req.url),
        _ => client.get(&req.url),
    };
    
    // Add headers if provided
    if let Some(headers) = &req.headers {
        for (key, value) in headers {
            request_builder = request_builder.header(key, value);
        }
    }
    
    // Set a reasonable timeout
    request_builder = request_builder.timeout(std::time::Duration::from_secs(30));
    
    match request_builder.send().await {
        Ok(response) => {
            // Get content type to determine how to parse the response
            let content_type = response.headers()
                .get("content-type")
                .and_then(|ct| ct.to_str().ok())
                .unwrap_or("")
                .to_lowercase();
            
            // Try to get the response text first
            match response.text().await {
                Ok(text_data) => {
                    println!("Proxy request successful, returning {} bytes", text_data.len());
                    
                    // Check if it's XML/RSS content
                    if content_type.contains("xml") || content_type.contains("rss") || 
                       text_data.trim_start().starts_with("<?xml") || 
                       text_data.contains("<rss") || text_data.contains("<feed") {
                        // Return as raw text for XML/RSS content
                        Ok(HttpResponse::Ok().json(ProxyResponse {
                            success: true,
                            data: Some(serde_json::Value::String(text_data)),
                            error: None,
                        }))
                    } else {
                        // Try to parse as JSON for non-XML content
                        match serde_json::from_str::<serde_json::Value>(&text_data) {
                            Ok(json_data) => {
                                Ok(HttpResponse::Ok().json(ProxyResponse {
                                    success: true,
                                    data: Some(json_data),
                                    error: None,
                                }))
                            }
                            Err(_) => {
                                // If JSON parsing fails, return as raw text
                                Ok(HttpResponse::Ok().json(ProxyResponse {
                                    success: true,
                                    data: Some(serde_json::Value::String(text_data)),
                                    error: None,
                                }))
                            }
                        }
                    }
                }
                Err(parse_error) => {
                    eprintln!("Failed to parse response as text: {parse_error}");
                    Ok(HttpResponse::InternalServerError().json(ProxyResponse {
                        success: false,
                        data: None,
                        error: Some(format!("Failed to parse response: {parse_error}")),
                    }))
                }
            }
        }
        Err(request_error) => {
            eprintln!("Proxy request failed: {request_error}");
            Ok(HttpResponse::InternalServerError().json(ProxyResponse {
                success: false,
                data: None,
                error: Some(format!("Request failed: {request_error}")),
            }))
        }
    }
}

// HDF5 request structure
#[derive(Debug, Deserialize)]
struct Hdf5Request {
    url: String,
}

// Proxy HDF5 files to avoid CORS issues and enable client-side processing
async fn proxy_hdf5_file(req: web::Json<Hdf5Request>) -> Result<HttpResponse> {
    println!("HDF5 proxy request to: {}", req.url);
    
    // Validate URL for basic security
    if !req.url.starts_with("http://") && !req.url.starts_with("https://") {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "Invalid URL: must be HTTP or HTTPS"
        })));
    }
    
    // Create HTTP client with timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout for large files
        .build()
        .map_err(|e| {
            eprintln!("Failed to create HTTP client: {}", e);
            actix_web::error::ErrorInternalServerError("Client creation failed")
        })?;
    
    // Fetch the HDF5 file
    match client.get(&req.url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                // Get content length if available
                let content_length = response.content_length();
                
                // Check file size limit (50MB)
                if let Some(size) = content_length {
                    if size > 50 * 1024 * 1024 {
                        return Ok(HttpResponse::BadRequest().json(json!({
                            "error": format!("File too large: {}MB exceeds 50MB limit", size / 1024 / 1024)
                        })));
                    }
                }
                
                // Get the binary data
                match response.bytes().await {
                    Ok(bytes) => {
                        println!("Successfully fetched HDF5 file: {} bytes", bytes.len());
                        
                        // Return binary data with appropriate headers
                        Ok(HttpResponse::Ok()
                            .insert_header(("Content-Type", "application/octet-stream"))
                            .insert_header(("Content-Length", bytes.len().to_string()))
                            .insert_header(("Access-Control-Allow-Origin", "*"))
                            .body(bytes))
                    }
                    Err(e) => {
                        eprintln!("Failed to read response body: {}", e);
                        Ok(HttpResponse::InternalServerError().json(json!({
                            "error": format!("Failed to read file data: {}", e)
                        })))
                    }
                }
            } else {
                eprintln!("HTTP error: {}", response.status());
                Ok(HttpResponse::BadGateway().json(json!({
                    "error": format!("Upstream server error: {}", response.status())
                })))
            }
        }
        Err(e) => {
            eprintln!("Request failed: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": format!("Request failed: {}", e)
            })))
        }
    }
}

// Get list of tables with row counts - returns real database tables with accurate counts
async fn get_tables(data: web::Data<Arc<ApiState>>, query: web::Query<std::collections::HashMap<String, String>>) -> Result<HttpResponse> {
    // Check if a specific connection is requested
    let connection_name = query.get("connection");
    let pool = if let Some(connection_name) = connection_name {
        // Get the database URL for this connection
        let database_url = if let Ok(url) = std::env::var(connection_name) {
            // Direct URL environment variable
            url
        } else {
            // Try component-based configuration
            let host_key = format!("{connection_name}_HOST");
            let port_key = format!("{connection_name}_PORT");
            let name_key = format!("{connection_name}_NAME");
            let user_key = format!("{connection_name}_USER");
            let password_key = format!("{connection_name}_PASSWORD");
            let ssl_key = format!("{connection_name}_SSL_MODE");
            
            if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(password)) = (
                std::env::var(&host_key),
                std::env::var(&port_key),
                std::env::var(&name_key),
                std::env::var(&user_key),
                std::env::var(&password_key)
            ) {
                let ssl_mode = std::env::var(&ssl_key).unwrap_or_else(|_| "require".to_string());
                format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}")
            } else {
                return Ok(HttpResponse::BadRequest().json(json!({
                    "error": format!("Connection '{}' not found in environment variables", connection_name)
                })));
            }
        };
        
        // Use the specified connection
        match sqlx::postgres::PgPool::connect(&database_url).await {
            Ok(pool) => pool,
            Err(e) => {
                return Ok(HttpResponse::InternalServerError().json(json!({
                    "error": format!("Failed to connect to {}: {}", connection_name, e)
                })));
            }
        }
    } else {
        // Use default connection
        match &data.db {
            Some(db) => db.clone(),
            None => {
                return Ok(HttpResponse::ServiceUnavailable().json(json!({
                    "error": "Database not available. Server started without database connection."
                })));
            }
        }
    };
    
    match get_database_tables(&pool, None, connection_name).await {
        Ok(tables) => {
            let mut table_info = Vec::new();
            
            // Get actual row counts for each table
            for table in tables {
                let query = format!("SELECT COUNT(*) FROM {}", table.name);
                match sqlx::query(&query).fetch_one(&pool).await {
                    Ok(row) => {
                        let count: i64 = row.get(0);
                        table_info.push(TableInfo {
                            name: table.name.clone(),
                            row_count: count,
                        });
                    }
                    Err(_) => {
                        // Table might not be accessible, use estimated count
                        table_info.push(TableInfo {
                            name: table.name.clone(),
                            row_count: table.rows.unwrap_or(0),
                        });
                    }
                }
            }
            
            Ok(HttpResponse::Ok().json(json!({ "tables": table_info })))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": format!("Failed to fetch tables: {}", e)
            })))
        }
    }
}

// Get list of mock tables - returns hardcoded placeholder data
async fn get_tables_mock() -> Result<HttpResponse> {
    let tables = vec![
        "users", "accounts", "contacts", "opportunities", "activities",
        "campaigns", "documents", "events", "roles", "projects",
        "products", "prospects", "calls", "leads", "surveyquestionoptions",
        "tags", "taggables"
    ];
    
    let table_info: Vec<TableInfo> = tables.iter().map(|table_name| {
        TableInfo {
            name: table_name.to_string(),
            row_count: 0, // Mock data shows 0 rows
        }
    }).collect();
    
    Ok(HttpResponse::Ok().json(json!({ "tables": table_info })))
}

// Test database connection
async fn db_test_connection(data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    match &data.db {
        Some(db) => {
            match test_db_connection(db).await {
                Ok(info) => Ok(HttpResponse::Ok().json(DatabaseResponse {
                    success: true,
                    message: Some("Database connection successful".to_string()),
                    error: None,
                    data: Some(serde_json::to_value(info).unwrap()),
                })),
                Err(e) => Ok(HttpResponse::InternalServerError().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some(format!("Connection failed: {e}")),
                    data: None,
                })),
            }
        }
        None => Ok(HttpResponse::ServiceUnavailable().json(DatabaseResponse {
            success: false,
            message: None,
            error: Some("Database not available. Server started without database connection.".to_string()),
            data: None,
        }))
    }
}

// Test Commons database connection specifically
async fn db_test_commons_connection(data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    match &data.db {
        Some(db) => {
            // The current db connection is to the Commons database
            match test_db_connection(db).await {
                Ok(info) => Ok(HttpResponse::Ok().json(json!({
                    "success": true,
                    "message": "Commons database connection successful",
                    "database": "membercommons",
                    "active": true,
                    "info": info
                }))),
                Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
                    "success": false,
                    "message": "Commons database connection failed",
                    "database": "membercommons", 
                    "active": false,
                    "error": e.to_string()
                }))),
            }
        }
        None => Ok(HttpResponse::ServiceUnavailable().json(json!({
            "success": false,
            "message": "Commons database not available",
            "database": "membercommons",
            "active": false,
            "error": "Server started without database connection"
        })))
    }
}

// Test Locations Database connection specifically
async fn db_test_location_connection(_data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    // Check if Locations environment variables are configured
    let location_host = std::env::var("LOCATIONS_HOST").unwrap_or_default();
    let location_name = std::env::var("LOCATIONS_NAME").unwrap_or_default();
    let location_user = std::env::var("LOCATIONS_USER").unwrap_or_default();
    let location_password = std::env::var("LOCATIONS_PASSWORD").unwrap_or_default();
    
    // Check if configuration has placeholder values
    if location_host.contains("your-server") || location_password == "your_password" || 
       location_host.is_empty() || location_name.is_empty() || location_user.is_empty() || location_password.is_empty() {
        return Ok(HttpResponse::Ok().json(json!({
            "success": false,
            "message": "Locations Database not configured",
            "database": "locations_db",
            "active": false,
            "error": "Database credentials not configured (placeholder values detected)"
        })));
    }
    
    // Attempt to create a temporary connection to test
    let ssl_mode = std::env::var("LOCATIONS_SSL_MODE").unwrap_or_else(|_| "require".to_string());
    let location_port = std::env::var("LOCATIONS_PORT").unwrap_or_else(|_| "5432".to_string());
    let database_url = format!("postgres://{location_user}:{location_password}@{location_host}:{location_port}/{location_name}?sslmode={ssl_mode}");
    
    match sqlx::postgres::PgPool::connect(&database_url).await {
        Ok(pool) => {
            match test_db_connection(&pool).await {
                Ok(info) => Ok(HttpResponse::Ok().json(json!({
                    "success": true,
                    "message": "Locations Database connection successful",
                    "database": "locations_db",
                    "active": true,
                    "info": info
                }))),
                Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
                    "success": false,
                    "message": "Locations Database connection failed",
                    "database": "locations_db",
                    "active": false,
                    "error": e.to_string()
                }))),
            }
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
            "success": false,
            "message": "Locations Database connection failed",
            "database": "locations_db",
            "active": false,
            "error": e.to_string()
        })))
    }
}

// Test Industry Database connection specifically
async fn db_test_exiobase_connection(_data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    // Check if Exiobase environment variables are configured
    let exiobase_host = std::env::var("EXIOBASE_HOST").unwrap_or_default();
    let exiobase_name = std::env::var("EXIOBASE_NAME").unwrap_or_default();
    let exiobase_user = std::env::var("EXIOBASE_USER").unwrap_or_default();
    let exiobase_password = std::env::var("EXIOBASE_PASSWORD").unwrap_or_default();
    
    // Check if configuration has placeholder values
    if exiobase_host.contains("your-server") || exiobase_password == "your_password" || 
       exiobase_host.is_empty() || exiobase_name.is_empty() || exiobase_user.is_empty() || exiobase_password.is_empty() {
        return Ok(HttpResponse::Ok().json(json!({
            "success": false,
            "message": "Industry Database not configured",
            "database": "model_earth_db",
            "active": false,
            "error": "Database credentials not configured (placeholder values detected)"
        })));
    }
    
    // Attempt to create a temporary connection to test
    let ssl_mode = std::env::var("EXIOBASE_SSL_MODE").unwrap_or_else(|_| "require".to_string());
    let database_url = format!("postgres://{exiobase_user}:{exiobase_password}@{exiobase_host}:5432/{exiobase_name}?sslmode={ssl_mode}");
    
    match sqlx::postgres::PgPool::connect(&database_url).await {
        Ok(pool) => {
            match test_db_connection(&pool).await {
                Ok(info) => Ok(HttpResponse::Ok().json(json!({
                    "success": true,
                    "message": "Industry Database connection successful",
                    "database": "model_earth_db",
                    "active": true,
                    "info": info
                }))),
                Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
                    "success": false,
                    "message": "Industry Database connection failed",
                    "database": "model_earth_db",
                    "active": false,
                    "error": e.to_string()
                }))),
            }
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
            "success": false,
            "message": "Industry Database connection failed",
            "database": "model_earth_db",
            "active": false,
            "error": e.to_string()
        })))
    }
}

// ============================================================
// Industry Database (EXIOBASE) — Trade Data Insert
// ============================================================

fn get_exiobase_database_url() -> Result<String, String> {
    let host = std::env::var("EXIOBASE_HOST").unwrap_or_default();
    let name = std::env::var("EXIOBASE_NAME").unwrap_or_default();
    let user = std::env::var("EXIOBASE_USER").unwrap_or_default();
    let password = std::env::var("EXIOBASE_PASSWORD").unwrap_or_default();
    let ssl_mode = std::env::var("EXIOBASE_SSL_MODE").unwrap_or_else(|_| "require".to_string());
    if host.is_empty() || name.is_empty() || user.is_empty() || password.is_empty() {
        return Err("Industry Database not configured — set EXIOBASE_* environment variables".to_string());
    }
    Ok(format!("postgres://{user}:{password}@{host}:5432/{name}?sslmode={ssl_mode}"))
}

async fn connect_to_exiobase() -> Result<Pool<Postgres>, String> {
    let url = get_exiobase_database_url()?;
    PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| format!("Failed to connect to Industry Database: {e}"))
}

async fn fetch_github_csv(url: &str) -> Result<String, String> {
    reqwest::get(url)
        .await
        .map_err(|e| format!("HTTP request failed for {url}: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Failed to read response body from {url}: {e}"))
}

// Run SQL, log result but don't propagate errors (graceful degradation for existing DBs)
async fn try_exec(pool: &Pool<Postgres>, sql: &str, steps: &mut Vec<String>) {
    match sqlx::query(sql).execute(pool).await {
        Ok(_)  => steps.push(format!("OK: {}", sql.split_whitespace().take(5).collect::<Vec<_>>().join(" "))),
        Err(e) => steps.push(format!("SKIP: {} — {}", sql.split_whitespace().take(5).collect::<Vec<_>>().join(" "), e)),
    }
}

async fn init_industry_tables_in_pool(pool: &Pool<Postgres>) -> Result<Vec<String>, String> {
    let mut steps: Vec<String> = Vec::new();

    // Create tables without FK references first (existing DBs may lack PKs)

    // industry — columns only; PK added separately so existing tables are handled
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS industry (
            industry_id VARCHAR(10),
            name        TEXT        NOT NULL,
            category    VARCHAR(100)
        )
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    steps.push("Ensured table: industry".to_string());
    try_exec(pool, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='industry_pkey') THEN ALTER TABLE industry ADD PRIMARY KEY (industry_id); END IF; END $$", &mut steps).await;

    // factor
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS factor (
            factor_id   INTEGER,
            unit        VARCHAR(50),
            stressor    TEXT,
            extension   VARCHAR(100)
        )
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    steps.push("Ensured table: factor".to_string());
    try_exec(pool, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='factor_pkey') THEN ALTER TABLE factor ADD PRIMARY KEY (factor_id); END IF; END $$", &mut steps).await;

    // trade
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS trade (
            id        BIGSERIAL     PRIMARY KEY,
            trade_id  INTEGER       NOT NULL,
            year      SMALLINT      NOT NULL,
            region1   VARCHAR(10)   NOT NULL,
            region2   VARCHAR(10)   NOT NULL,
            industry1 VARCHAR(10),
            industry2 VARCHAR(10),
            amount    NUMERIC(18,4),
            flow_type VARCHAR(10)   NOT NULL DEFAULT 'unknown',
            country   VARCHAR(10)   NOT NULL DEFAULT 'unknown'
        )
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    steps.push("Ensured table: trade".to_string());
    try_exec(pool, "ALTER TABLE trade ADD COLUMN IF NOT EXISTS flow_type VARCHAR(10) NOT NULL DEFAULT 'unknown'", &mut steps).await;
    try_exec(pool, "ALTER TABLE trade ADD COLUMN IF NOT EXISTS country   VARCHAR(10) NOT NULL DEFAULT 'unknown'", &mut steps).await;
    try_exec(pool, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_dedup') THEN ALTER TABLE trade ADD CONSTRAINT trade_dedup UNIQUE (trade_id, year, country, flow_type); END IF; END $$", &mut steps).await;

    // trade_factor
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS trade_factor (
            id           BIGSERIAL      PRIMARY KEY,
            trade_id     INTEGER        NOT NULL,
            year         SMALLINT       NOT NULL,
            country      VARCHAR(10)    NOT NULL,
            flow_type    VARCHAR(10)    NOT NULL,
            factor_id    INTEGER        NOT NULL,
            coefficient  NUMERIC(20,10),
            level NUMERIC(20,6)
        )
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    steps.push("Ensured table: trade_factor".to_string());

    // interstate
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS interstate (
            id                  BIGSERIAL     PRIMARY KEY,
            trade_id            INTEGER       NOT NULL,
            year                SMALLINT      NOT NULL,
            region1             VARCHAR(10)   NOT NULL,
            region2             VARCHAR(10)   NOT NULL,
            industry1           VARCHAR(10),
            industry2           VARCHAR(10),
            amount              NUMERIC(18,4),
            commodity_code      VARCHAR(30),
            industry_code       VARCHAR(30),
            economic_multiplier NUMERIC(10,6)
        )
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    steps.push("Ensured table: interstate".to_string());

    // interstate_factor
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS interstate_factor (
            id                  BIGSERIAL     PRIMARY KEY,
            interstate_id       VARCHAR(80)   NOT NULL,
            trade_id            INTEGER       NOT NULL,
            factor_id           INTEGER,
            coefficient         NUMERIC(20,10),
            state_industry_code VARCHAR(30),
            level          NUMERIC(20,6),
            flow_type           VARCHAR(20),
            employment_impact   NUMERIC(20,10)
        )
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    // Add factor_id / coefficient columns if table already existed without them
    try_exec(pool, "ALTER TABLE interstate_factor ADD COLUMN IF NOT EXISTS factor_id INTEGER", &mut steps).await;
    try_exec(pool, "ALTER TABLE interstate_factor ADD COLUMN IF NOT EXISTS coefficient NUMERIC(20,10)", &mut steps).await;
    steps.push("Ensured table: interstate_factor".to_string());

    // FK constraints (gracefully skipped if PKs unavailable)
    for sql in &[
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_trade_industry1') THEN ALTER TABLE trade ADD CONSTRAINT fk_trade_industry1 FOREIGN KEY (industry1) REFERENCES industry(industry_id); END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_trade_industry2') THEN ALTER TABLE trade ADD CONSTRAINT fk_trade_industry2 FOREIGN KEY (industry2) REFERENCES industry(industry_id); END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_tf_factor') THEN ALTER TABLE trade_factor ADD CONSTRAINT fk_tf_factor FOREIGN KEY (factor_id) REFERENCES factor(factor_id); END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_istate_industry1') THEN ALTER TABLE interstate ADD CONSTRAINT fk_istate_industry1 FOREIGN KEY (industry1) REFERENCES industry(industry_id); END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_istate_industry2') THEN ALTER TABLE interstate ADD CONSTRAINT fk_istate_industry2 FOREIGN KEY (industry2) REFERENCES industry(industry_id); END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_isf_factor') THEN ALTER TABLE interstate_factor ADD CONSTRAINT fk_isf_factor FOREIGN KEY (factor_id) REFERENCES factor(factor_id); END IF; END $$",
    ] {
        try_exec(pool, sql, &mut steps).await;
    }
    steps.push("Processed FK constraints".to_string());

    // Indexes
    for sql in &[
        "CREATE INDEX IF NOT EXISTS idx_trade_lookup       ON trade (trade_id, year, country, flow_type)",
        "CREATE INDEX IF NOT EXISTS idx_trade_year_country ON trade (year, country)",
        "CREATE INDEX IF NOT EXISTS idx_trade_region1      ON trade (region1)",
        "CREATE INDEX IF NOT EXISTS idx_trade_region2      ON trade (region2)",
        "CREATE INDEX IF NOT EXISTS idx_trade_flow_type    ON trade (flow_type)",
        "CREATE INDEX IF NOT EXISTS idx_tf_lookup          ON trade_factor (trade_id, year, country, flow_type)",
        "CREATE INDEX IF NOT EXISTS idx_tf_factor_id       ON trade_factor (factor_id)",
        "CREATE INDEX IF NOT EXISTS idx_tf_year_country    ON trade_factor (year, country)",
        "CREATE INDEX IF NOT EXISTS idx_istate_trade_id    ON interstate (trade_id)",
        "CREATE INDEX IF NOT EXISTS idx_istate_year        ON interstate (year)",
        "CREATE INDEX IF NOT EXISTS idx_istate_region1     ON interstate (region1)",
        "CREATE INDEX IF NOT EXISTS idx_istate_region2     ON interstate (region2)",
        "CREATE INDEX IF NOT EXISTS idx_isf_trade_id       ON interstate_factor (trade_id)",
        "CREATE INDEX IF NOT EXISTS idx_isf_interstate_id  ON interstate_factor (interstate_id)",
        "CREATE INDEX IF NOT EXISTS idx_isf_factor_id      ON interstate_factor (factor_id)",
    ] {
        try_exec(pool, sql, &mut steps).await;
    }
    steps.push("Processed indexes".to_string());

    Ok(steps)
}

// POST /api/db/init-industry-tables
async fn db_init_industry_tables(_data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    match connect_to_exiobase().await {
        Err(e) => Ok(HttpResponse::ServiceUnavailable().json(json!({
            "success": false, "error": e
        }))),
        Ok(pool) => match init_industry_tables_in_pool(&pool).await {
            Ok(steps) => Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "message": "Industry tables initialized",
                "steps": steps
            }))),
            Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
                "success": false, "error": e
            }))),
        },
    }
}

// ---- CSV insert helpers ----

async fn upsert_factor_rows(pool: &Pool<Postgres>, text: &str) -> Result<usize, String> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let mut rows: Vec<(i32, String, String, String)> = Vec::new();
    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        let factor_id: i32 = r.get(0).unwrap_or("").parse().unwrap_or(0);
        let unit = r.get(1).unwrap_or("").to_string();
        let stressor = r.get(2).unwrap_or("").to_string();
        let extension = r.get(3).unwrap_or("").to_string();
        rows.push((factor_id, unit, stressor, extension));
    }
    let count = rows.len();
    for chunk in rows.chunks(500) {
        let mut qb = sqlx::QueryBuilder::<Postgres>::new(
            "INSERT INTO factor (factor_id, unit, stressor, extension) "
        );
        qb.push_values(chunk, |mut b, (fid, unit, stressor, ext)| {
            b.push_bind(fid).push_bind(unit).push_bind(stressor).push_bind(ext);
        });
        qb.push(" ON CONFLICT (factor_id) DO NOTHING");
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

async fn upsert_industry_rows(pool: &Pool<Postgres>, text: &str) -> Result<usize, String> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let mut rows: Vec<(String, String, String)> = Vec::new();
    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        let industry_id = r.get(0).unwrap_or("").to_string();
        let name = r.get(1).unwrap_or("").to_string();
        let category = r.get(2).unwrap_or("").to_string();
        rows.push((industry_id, name, category));
    }
    let count = rows.len();
    for chunk in rows.chunks(500) {
        let mut qb = sqlx::QueryBuilder::<Postgres>::new(
            "INSERT INTO industry (industry_id, name, category) "
        );
        qb.push_values(chunk, |mut b, (iid, name, cat)| {
            b.push_bind(iid).push_bind(name).push_bind(cat);
        });
        qb.push(" ON CONFLICT (industry_id) DO NOTHING");
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

async fn insert_trade_rows(
    pool: &Pool<Postgres>,
    text: &str,
    flow_type: &str,
    country: &str,
) -> Result<usize, String> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let mut rows: Vec<(i32, i16, String, String, String, String, f64)> = Vec::new();
    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        let trade_id: i32 = r.get(0).unwrap_or("").parse().unwrap_or(0);
        let year: i16 = r.get(1).unwrap_or("").parse().unwrap_or(0);
        let region1 = r.get(2).unwrap_or("").to_string();
        let region2 = r.get(3).unwrap_or("").to_string();
        let industry1 = r.get(4).unwrap_or("").to_string();
        let industry2 = r.get(5).unwrap_or("").to_string();
        let amount: f64 = r.get(6).unwrap_or("").parse().unwrap_or(0.0);
        rows.push((trade_id, year, region1, region2, industry1, industry2, amount));
    }
    let count = rows.len();
    let ft = flow_type.to_string();
    let ct = country.to_string();
    for chunk in rows.chunks(500) {
        let mut qb = sqlx::QueryBuilder::<Postgres>::new(
            "INSERT INTO trade (trade_id, year, region1, region2, industry1, industry2, amount, flow_type, country) "
        );
        qb.push_values(chunk, |mut b, (tid, yr, r1, r2, i1, i2, amt)| {
            b.push_bind(tid).push_bind(yr).push_bind(r1).push_bind(r2)
             .push_bind(i1).push_bind(i2).push_bind(*amt as f64)
             .push_bind(&ft).push_bind(&ct);
        });
        qb.push(" ON CONFLICT (trade_id, year, country, flow_type) DO NOTHING");
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

async fn insert_trade_factor_rows(
    pool: &Pool<Postgres>,
    text: &str,
    year: i16,
    flow_type: &str,
    country: &str,
) -> Result<usize, String> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let mut rows: Vec<(i32, i32, f64, f64)> = Vec::new();
    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        let trade_id: i32 = r.get(0).unwrap_or("").parse().unwrap_or(0);
        let factor_id: i32 = r.get(1).unwrap_or("").parse().unwrap_or(0);
        let coefficient: f64 = r.get(2).unwrap_or("").parse().unwrap_or(0.0);
        let level: f64 = r.get(3).unwrap_or("").parse().unwrap_or(0.0);
        rows.push((trade_id, factor_id, coefficient, level));
    }
    let count = rows.len();
    let ft = flow_type.to_string();
    let ct = country.to_string();
    for chunk in rows.chunks(500) {
        let mut qb = sqlx::QueryBuilder::<Postgres>::new(
            "INSERT INTO trade_factor (trade_id, year, country, flow_type, factor_id, coefficient, level) "
        );
        qb.push_values(chunk, |mut b, (tid, fid, coef, imp)| {
            b.push_bind(tid).push_bind(year).push_bind(&ct).push_bind(&ft)
             .push_bind(fid).push_bind(*coef).push_bind(*imp);
        });
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

async fn insert_interstate_rows(
    pool: &Pool<Postgres>,
    text: &str,
) -> Result<usize, String> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    // Detect column names to handle both bea_trade_detail.csv (old) and interstate.csv (new)
    let headers = rdr.headers().map_err(|e| e.to_string())?.clone();
    let commodity_col = headers.iter().position(|h| h == "bea_commodity_code" || h == "commodity_code").unwrap_or(7);
    let industry_col  = headers.iter().position(|h| h == "bea_industry_code" || h == "industry_code").unwrap_or(8);

    let mut rows: Vec<(i32, i16, String, String, String, String, f64, String, String, f64)> = Vec::new();
    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        let trade_id: i32 = r.get(0).unwrap_or("").parse().unwrap_or(0);
        let year: i16    = r.get(1).unwrap_or("").parse().unwrap_or(0);
        let region1 = r.get(2).unwrap_or("").to_string();
        let region2 = r.get(3).unwrap_or("").to_string();
        let industry1 = r.get(4).unwrap_or("").to_string();
        let industry2 = r.get(5).unwrap_or("").to_string();
        let amount: f64  = r.get(6).unwrap_or("").parse().unwrap_or(0.0);
        let commodity_code = r.get(commodity_col).unwrap_or("").to_string();
        let industry_code  = r.get(industry_col).unwrap_or("").to_string();
        let economic_multiplier: f64 = r.get(9).unwrap_or("").parse().unwrap_or(1.0);
        rows.push((trade_id, year, region1, region2, industry1, industry2, amount, commodity_code, industry_code, economic_multiplier));
    }
    let count = rows.len();
    for chunk in rows.chunks(500) {
        let mut qb = sqlx::QueryBuilder::<Postgres>::new(
            "INSERT INTO interstate (trade_id, year, region1, region2, industry1, industry2, amount, commodity_code, industry_code, economic_multiplier) "
        );
        qb.push_values(chunk, |mut b, (tid, yr, r1, r2, i1, i2, amt, cc, ic, em)| {
            b.push_bind(tid).push_bind(yr).push_bind(r1).push_bind(r2)
             .push_bind(i1).push_bind(i2).push_bind(*amt)
             .push_bind(cc).push_bind(ic).push_bind(*em);
        });
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

async fn insert_interstate_factor_rows(
    pool: &Pool<Postgres>,
    text: &str,
    _year: i16,
) -> Result<usize, String> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let headers = rdr.headers().map_err(|e| e.to_string())?.clone();
    let col = |name: &str| headers.iter().position(|h| h == name);

    let idx_iid  = col("interstate_id");
    let idx_tid  = col("trade_id");
    let idx_fid  = col("factor_id");
    let idx_coef = col("coefficient");
    let idx_sic  = col("state_industry_code");
    let idx_fv   = col("level");
    let idx_ft   = col("flow_type");
    let idx_ei   = col("employment_impact");
    // Legacy columns (old CSV without interstate_id)
    let idx_orig = col("origin_state");
    let idx_dest = col("destination_state");

    // (interstate_id, trade_id, factor_id?, coefficient?, state_industry_code, level, flow_type, employment_impact)
    let mut rows: Vec<(String, i32, Option<i32>, Option<f64>, String, f64, String, f64)> = Vec::new();

    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        let g = |i: Option<usize>| i.and_then(|i| r.get(i)).unwrap_or("").to_string();

        let trade_id: i32 = g(idx_tid).parse().unwrap_or(0);
        let sic   = g(idx_sic);
        let fv: f64 = g(idx_fv).parse().unwrap_or(0.0);
        let ft    = g(idx_ft);
        let ei: f64 = g(idx_ei).parse().unwrap_or(0.0);
        let factor_id: Option<i32> = idx_fid.and_then(|i| r.get(i)).and_then(|s| s.parse().ok());
        let coeff: Option<f64>     = idx_coef.and_then(|i| r.get(i)).and_then(|s| s.parse().ok());

        // interstate_id: prefer direct column; fall back to computing from legacy origin/dest
        let interstate_id = if let Some(iid) = idx_iid.and_then(|i| r.get(i)).filter(|s| !s.is_empty()) {
            iid.to_string()
        } else {
            let origin = g(idx_orig);
            let dest   = g(idx_dest);
            format!("{_year}-US-{origin}-US-{dest}-{sic}")
        };

        rows.push((interstate_id, trade_id, factor_id, coeff, sic, fv, ft, ei));
    }

    let count = rows.len();
    for chunk in rows.chunks(500) {
        let mut qb = sqlx::QueryBuilder::<Postgres>::new(
            "INSERT INTO interstate_factor (interstate_id, trade_id, factor_id, coefficient, state_industry_code, level, flow_type, employment_impact) "
        );
        qb.push_values(chunk, |mut b, (iid, tid, fid, coef, sic, fv, ft, ei)| {
            b.push_bind(iid)
             .push_bind(tid)
             .push_bind(*fid)
             .push_bind(*coef)
             .push_bind(sic)
             .push_bind(*fv)
             .push_bind(ft)
             .push_bind(*ei);
        });
        qb.build().execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

#[derive(Deserialize)]
struct InsertTradeDataRequest {
    year: String,
    country: String,
}

// POST /api/db/insert-trade-data
async fn db_insert_trade_data(
    _data: web::Data<Arc<ApiState>>,
    req: web::Json<InsertTradeDataRequest>,
) -> Result<HttpResponse> {
    let year_str = req.year.trim().to_string();
    let country  = req.country.trim().to_uppercase();

    let year_num: i16 = match year_str.parse() {
        Ok(y) => y,
        Err(_) => return Ok(HttpResponse::BadRequest().json(json!({
            "success": false, "error": "Invalid year"
        }))),
    };

    let pool = match connect_to_exiobase().await {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({
            "success": false, "error": e
        }))),
    };

    // Ensure tables exist
    if let Err(e) = init_industry_tables_in_pool(&pool).await {
        return Ok(HttpResponse::InternalServerError().json(json!({
            "success": false, "error": format!("Table init failed: {e}")
        })));
    }

    let base = "https://raw.githubusercontent.com/ModelEarth/trade-data/refs/heads/main/year";
    let mut summary: Vec<serde_json::Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // 1. factor.csv
    let factor_url = format!("{base}/{year_str}/factor.csv");
    match fetch_github_csv(&factor_url).await {
        Err(e) => errors.push(format!("factor.csv: {e}")),
        Ok(text) => match upsert_factor_rows(&pool, &text).await {
            Ok(n) => summary.push(json!({"file": "factor.csv", "rows": n})),
            Err(e) => errors.push(format!("factor.csv insert: {e}")),
        },
    }

    // 2. industry.csv
    let industry_url = format!("{base}/{year_str}/industry.csv");
    match fetch_github_csv(&industry_url).await {
        Err(e) => errors.push(format!("industry.csv: {e}")),
        Ok(text) => match upsert_industry_rows(&pool, &text).await {
            Ok(n) => summary.push(json!({"file": "industry.csv", "rows": n})),
            Err(e) => errors.push(format!("industry.csv insert: {e}")),
        },
    }

    // 3. trade.csv + trade_factor.csv for each flow type
    for flow_type in &["domestic", "imports", "exports"] {
        let trade_url = format!("{base}/{year_str}/{country}/{flow_type}/trade.csv");
        match fetch_github_csv(&trade_url).await {
            Err(e) => errors.push(format!("{flow_type}/trade.csv: {e}")),
            Ok(text) => match insert_trade_rows(&pool, &text, flow_type, &country).await {
                Ok(n) => summary.push(json!({"file": format!("{flow_type}/trade.csv"), "rows": n})),
                Err(e) => errors.push(format!("{flow_type}/trade.csv insert: {e}")),
            },
        }

        let tf_url = format!("{base}/{year_str}/{country}/{flow_type}/trade_factor.csv");
        match fetch_github_csv(&tf_url).await {
            Err(e) => errors.push(format!("{flow_type}/trade_factor.csv: {e}")),
            Ok(text) => match insert_trade_factor_rows(&pool, &text, year_num, flow_type, &country).await {
                Ok(n) => summary.push(json!({"file": format!("{flow_type}/trade_factor.csv"), "rows": n})),
                Err(e) => errors.push(format!("{flow_type}/trade_factor.csv insert: {e}")),
            },
        }
    }

    // 4. US BEA interstate data (domestic only)
    if country == "US" {
        let interstate_url = format!("{base}/{year_str}/US/domestic/bea_trade_detail.csv");
        match fetch_github_csv(&interstate_url).await {
            Err(e) => errors.push(format!("bea_trade_detail.csv: {e}")),
            Ok(text) => match insert_interstate_rows(&pool, &text).await {
                Ok(n) => summary.push(json!({"file": "bea_trade_detail.csv → interstate", "rows": n})),
                Err(e) => errors.push(format!("bea_trade_detail.csv insert: {e}")),
            },
        }

        let isf_url = format!("{base}/{year_str}/US/domestic/state_trade_flows.csv");
        match fetch_github_csv(&isf_url).await {
            Err(e) => errors.push(format!("state_trade_flows.csv: {e}")),
            Ok(text) => match insert_interstate_factor_rows(&pool, &text, year_num).await {
                Ok(n) => summary.push(json!({"file": "state_trade_flows.csv → interstate_factor", "rows": n})),
                Err(e) => errors.push(format!("state_trade_flows.csv insert: {e}")),
            },
        }
    }

    Ok(HttpResponse::Ok().json(json!({
        "success": errors.is_empty(),
        "year": year_str,
        "country": country,
        "inserted": summary,
        "errors": errors
    })))
}

// GET /api/db/industry-schema
async fn db_get_industry_schema(_data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    let pool = match connect_to_exiobase().await {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::ServiceUnavailable().json(json!({
            "success": false, "error": e,
            "schema": industry_static_schema()
        }))),
    };

    // Query columns from information_schema
    let col_rows = sqlx::query(r#"
        SELECT table_name, column_name, data_type, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('trade','trade_factor','factor','industry','interstate','interstate_factor')
        ORDER BY table_name, ordinal_position
    "#).fetch_all(&pool).await;

    // Query row counts from pg_stat_user_tables
    let count_rows = sqlx::query(r#"
        SELECT relname AS table_name, n_live_tup AS row_count
        FROM pg_stat_user_tables
        WHERE relname IN ('trade','trade_factor','factor','industry','interstate','interstate_factor')
    "#).fetch_all(&pool).await;

    let mut tables: HashMap<String, serde_json::Value> = HashMap::new();

    // Build static schema as base (columns)
    for (name, cols) in industry_static_schema().as_object().unwrap_or(&serde_json::Map::new()) {
        tables.insert(name.clone(), json!({"columns": cols, "row_count": 0, "exists": false}));
    }

    if let Ok(rows) = col_rows {
        let mut seen_tables: std::collections::HashSet<String> = std::collections::HashSet::new();
        for row in &rows {
            let tname: String = row.get("table_name");
            seen_tables.insert(tname.clone());
        }
        // Mark existing tables
        for tname in seen_tables {
            if let Some(entry) = tables.get_mut(&tname) {
                entry["exists"] = json!(true);
            }
        }
        // Build column lists from live DB
        let mut live_cols: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
        for row in &rows {
            let tname: String = row.get("table_name");
            let cname: String = row.get("column_name");
            let dtype: String = row.get("data_type");
            live_cols.entry(tname).or_default().push(json!({"name": cname, "type": dtype}));
        }
        for (tname, cols) in live_cols {
            if let Some(entry) = tables.get_mut(&tname) {
                entry["columns"] = json!(cols);
            }
        }
    }

    if let Ok(rows) = count_rows {
        for row in rows {
            let tname: String = row.get("table_name");
            let cnt: i64 = row.get("row_count");
            if let Some(entry) = tables.get_mut(&tname) {
                entry["row_count"] = json!(cnt);
            }
        }
    }

    Ok(HttpResponse::Ok().json(json!({
        "success": true,
        "tables": tables,
        "relationships": [
            {"from": "trade",        "to": "industry",           "on": "industry1 / industry2"},
            {"from": "trade_factor", "to": "trade",              "on": "trade_id + year + country + flow_type"},
            {"from": "trade_factor", "to": "factor",             "on": "factor_id"},
            {"from": "interstate",   "to": "industry",           "on": "industry1 / industry2"},
            {"from": "interstate",   "to": "trade",              "on": "trade_id (US domestic)"},
            {"from": "interstate_factor", "to": "interstate",    "on": "trade_id"}
        ]
    })))
}

fn industry_static_schema() -> serde_json::Value {
    json!({
        "industry":  [
            {"name":"industry_id","type":"varchar(10)"},
            {"name":"name","type":"text"},
            {"name":"category","type":"varchar(100)"}
        ],
        "factor": [
            {"name":"factor_id","type":"integer"},
            {"name":"unit","type":"varchar(50)"},
            {"name":"stressor","type":"text"},
            {"name":"extension","type":"varchar(100)"}
        ],
        "trade": [
            {"name":"id","type":"bigserial"},
            {"name":"trade_id","type":"integer"},
            {"name":"year","type":"smallint"},
            {"name":"region1","type":"varchar(10)"},
            {"name":"region2","type":"varchar(10)"},
            {"name":"industry1","type":"varchar(10)"},
            {"name":"industry2","type":"varchar(10)"},
            {"name":"amount","type":"numeric"},
            {"name":"flow_type","type":"varchar(10)"},
            {"name":"country","type":"varchar(10)"}
        ],
        "trade_factor": [
            {"name":"id","type":"bigserial"},
            {"name":"trade_id","type":"integer"},
            {"name":"year","type":"smallint"},
            {"name":"country","type":"varchar(10)"},
            {"name":"flow_type","type":"varchar(10)"},
            {"name":"factor_id","type":"integer"},
            {"name":"coefficient","type":"numeric"},
            {"name":"level","type":"numeric"}
        ],
        "interstate": [
            {"name":"id","type":"bigserial"},
            {"name":"trade_id","type":"integer"},
            {"name":"year","type":"smallint"},
            {"name":"region1","type":"varchar(10)"},
            {"name":"region2","type":"varchar(10)"},
            {"name":"industry1","type":"varchar(10)"},
            {"name":"industry2","type":"varchar(10)"},
            {"name":"amount","type":"numeric"},
            {"name":"commodity_code","type":"varchar(30)"},
            {"name":"industry_code","type":"varchar(30)"},
            {"name":"economic_multiplier","type":"numeric"}
        ],
        "interstate_factor": [
            {"name":"id","type":"bigserial"},
            {"name":"interstate_id","type":"varchar(80)"},
            {"name":"trade_id","type":"integer"},
            {"name":"factor_id","type":"integer"},
            {"name":"coefficient","type":"numeric"},
            {"name":"state_industry_code","type":"varchar(30)"},
            {"name":"level","type":"numeric"},
            {"name":"flow_type","type":"varchar(20)"},
            {"name":"employment_impact","type":"numeric"}
        ]
    })
}

// ============================================================
// End Industry Database Trade Data Insert
// ============================================================

// List database tables with detailed info
async fn db_list_tables(
    data: web::Data<Arc<ApiState>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    let limit = query.get("limit").and_then(|s| s.parse::<i32>().ok());
    match &data.db {
        Some(db) => {
            match get_database_tables(db, limit, None).await {
                Ok(tables) => Ok(HttpResponse::Ok().json(DatabaseResponse {
                    success: true,
                    message: Some(format!("Found {} tables", tables.len())),
                    error: None,
                    data: Some(serde_json::json!({ "tables": tables })),
                })),
                Err(e) => Ok(HttpResponse::InternalServerError().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some(format!("Failed to list tables: {e}")),
                    data: None,
                })),
            }
        }
        None => Ok(HttpResponse::ServiceUnavailable().json(DatabaseResponse {
            success: false,
            message: None,
            error: Some("Database not available. Server started without database connection.".to_string()),
            data: None,
        }))
    }
}

// Get table information
async fn db_get_table_info(
    data: web::Data<Arc<ApiState>>,
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    let table_name = path.into_inner();
    
    // Check if a specific connection is requested
    let pool = if let Some(connection_name) = query.get("connection") {
        // Get the database URL for this connection
        let database_url = if let Ok(url) = std::env::var(connection_name) {
            // Direct URL environment variable
            url
        } else {
            // Try component-based configuration
            let host_key = format!("{connection_name}_HOST");
            let port_key = format!("{connection_name}_PORT");
            let name_key = format!("{connection_name}_NAME");
            let user_key = format!("{connection_name}_USER");
            let password_key = format!("{connection_name}_PASSWORD");
            let ssl_key = format!("{connection_name}_SSL_MODE");
            
            if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(password)) = (
                std::env::var(&host_key),
                std::env::var(&port_key),
                std::env::var(&name_key),
                std::env::var(&user_key),
                std::env::var(&password_key)
            ) {
                let ssl_mode = std::env::var(&ssl_key).unwrap_or_else(|_| "require".to_string());
                format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}")
            } else {
                return Ok(HttpResponse::BadRequest().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some(format!("Connection '{connection_name}' not found in environment variables")),
                    data: None,
                }));
            }
        };
        
        // Use the specified connection
        match sqlx::postgres::PgPool::connect(&database_url).await {
            Ok(pool) => pool,
            Err(e) => {
                return Ok(HttpResponse::InternalServerError().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some(format!("Failed to connect to {connection_name}: {e}")),
                    data: None,
                }));
            }
        }
    } else {
        // Use default connection
        match &data.db {
            Some(db) => db.clone(),
            None => {
                return Ok(HttpResponse::ServiceUnavailable().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some("Database not available. Server started without database connection.".to_string()),
                    data: None,
                }));
            }
        }
    };
    
    match get_table_details(&pool, &table_name).await {
        Ok(info) => Ok(HttpResponse::Ok().json(DatabaseResponse {
            success: true,
            message: Some(format!("Table {table_name} found")),
            error: None,
            data: Some(serde_json::to_value(info).unwrap()),
        })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(DatabaseResponse {
            success: false,
            message: None,
            error: Some(format!("Failed to get table info: {e}")),
            data: None,
        })),
    }
}

// Execute custom query (use with caution!)
async fn db_execute_query(
    data: web::Data<Arc<ApiState>>,
    query_req: web::Json<QueryRequest>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    // Only allow safe SELECT queries for security
    let query_text = query_req.query.trim().to_lowercase();
    if !query_text.starts_with("select") {
        return Ok(HttpResponse::BadRequest().json(DatabaseResponse {
            success: false,
            message: None,
            error: Some("Only SELECT queries are allowed".to_string()),
            data: None,
        }));
    }

    // Check if a specific connection is requested
    let pool = if let Some(connection_name) = query.get("connection") {
        // Get the database URL for this connection
        let database_url = if let Ok(url) = std::env::var(connection_name) {
            // Direct URL environment variable
            url
        } else {
            // Try component-based configuration
            let host_key = format!("{connection_name}_HOST");
            let port_key = format!("{connection_name}_PORT");
            let name_key = format!("{connection_name}_NAME");
            let user_key = format!("{connection_name}_USER");
            let password_key = format!("{connection_name}_PASSWORD");
            let ssl_key = format!("{connection_name}_SSL_MODE");
            
            if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(password)) = (
                std::env::var(&host_key),
                std::env::var(&port_key),
                std::env::var(&name_key),
                std::env::var(&user_key),
                std::env::var(&password_key)
            ) {
                let ssl_mode = std::env::var(&ssl_key).unwrap_or_else(|_| "require".to_string());
                format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}")
            } else {
                return Ok(HttpResponse::BadRequest().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some(format!("Connection '{connection_name}' not found in environment variables")),
                    data: None,
                }));
            }
        };
        
        // Use the specified connection
        match sqlx::postgres::PgPool::connect(&database_url).await {
            Ok(pool) => pool,
            Err(e) => {
                return Ok(HttpResponse::InternalServerError().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some(format!("Failed to connect to {connection_name}: {e}")),
                    data: None,
                }));
            }
        }
    } else {
        // Use default connection
        match &data.db {
            Some(db) => db.clone(),
            None => {
                return Ok(HttpResponse::ServiceUnavailable().json(DatabaseResponse {
                    success: false,
                    message: None,
                    error: Some("Database not available. Server started without database connection.".to_string()),
                    data: None,
                }));
            }
        }
    };

    match execute_safe_query(&pool, &query_req.query).await {
        Ok(result) => Ok(HttpResponse::Ok().json(DatabaseResponse {
            success: true,
            message: Some("Query executed successfully".to_string()),
            error: None,
            data: Some(result),
        })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(DatabaseResponse {
            success: false,
            message: None,
            error: Some(format!("Query failed: {e}")),
            data: None,
        })),
    }
}

// Get paginated, sortable rows from a table
async fn db_get_table_rows(
    data: web::Data<Arc<ApiState>>,
    req: web::Json<TableRowsRequest>,
) -> Result<HttpResponse> {
    // Validate table name
    if req.table.is_empty() || !req.table.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "Invalid table name: only alphanumeric characters and underscores are allowed"
        })));
    }
    // Validate sort field
    if let Some(field) = &req.sort_field {
        if !field.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": "Invalid sort field: only alphanumeric characters and underscores are allowed"
            })));
        }
    }

    let page = req.page.unwrap_or(1).max(1);
    let size = req.size.unwrap_or(200).clamp(1, 1000);
    let offset = (page - 1) * size;

    let sort_clause = match (&req.sort_field, &req.sort_dir) {
        (Some(field), Some(dir)) => {
            let direction = if dir.to_lowercase() == "desc" { "DESC" } else { "ASC" };
            format!("ORDER BY \"{field}\" {direction}")
        }
        (Some(field), None) => format!("ORDER BY \"{field}\" ASC"),
        _ => String::new(),
    };

    let pool = if let Some(connection_name) = &req.connection {
        let database_url = if let Ok(url) = std::env::var(connection_name) {
            url
        } else {
            let host_key = format!("{connection_name}_HOST");
            let port_key = format!("{connection_name}_PORT");
            let name_key = format!("{connection_name}_NAME");
            let user_key = format!("{connection_name}_USER");
            let password_key = format!("{connection_name}_PASSWORD");
            let ssl_key = format!("{connection_name}_SSL_MODE");
            if let (Ok(host), Ok(port), Ok(name), Ok(user), Ok(password)) = (
                std::env::var(&host_key),
                std::env::var(&port_key),
                std::env::var(&name_key),
                std::env::var(&user_key),
                std::env::var(&password_key),
            ) {
                let ssl_mode = std::env::var(&ssl_key).unwrap_or_else(|_| "require".to_string());
                format!("postgres://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}")
            } else {
                return Ok(HttpResponse::BadRequest().json(json!({
                    "error": format!("Connection '{connection_name}' not found in environment variables")
                })));
            }
        };
        match sqlx::postgres::PgPool::connect(&database_url).await {
            Ok(pool) => pool,
            Err(e) => return Ok(HttpResponse::InternalServerError().json(json!({
                "error": format!("Failed to connect to {connection_name}: {e}")
            }))),
        }
    } else {
        match &data.db {
            Some(db) => db.clone(),
            None => return Ok(HttpResponse::ServiceUnavailable().json(json!({
                "error": "Database not available"
            }))),
        }
    };

    let count_sql = format!("SELECT COUNT(*) FROM \"{}\"", req.table);
    let total: i64 = match sqlx::query(&count_sql).fetch_one(&pool).await {
        Ok(row) => row.get(0),
        Err(e) => return Ok(HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to count rows in {}: {e}", req.table)
        }))),
    };

    let data_sql = format!("SELECT * FROM \"{}\" {} LIMIT {size} OFFSET {offset}", req.table, sort_clause);
    let rows = match execute_safe_query(&pool, &data_sql).await {
        Ok(rows) => rows,
        Err(e) => return Ok(HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to fetch rows from {}: {e}", req.table)
        }))),
    };

    let last_page = ((total as f64) / (size as f64)).ceil() as i64;

    Ok(HttpResponse::Ok().json(json!({
        "last_page": last_page.max(1),
        "data": rows,
        "total": total,
        "page": page,
        "size": size,
    })))
}

// Create a new project
// Get all projects from database
async fn get_projects(data: web::Data<Arc<ApiState>>) -> Result<HttpResponse> {
    let db = match &data.db {
        Some(db) => db,
        None => {
            return Ok(HttpResponse::ServiceUnavailable().json(json!({
                "error": "Database not available. Server started without database connection."
            })));
        }
    };
    
    let projects_query = sqlx::query(
        "SELECT id, name, description, status, date_entered, date_modified FROM projects ORDER BY date_modified DESC LIMIT 50"
    )
    .fetch_all(db)
    .await;
    
    match projects_query {
        Ok(rows) => {
            let projects: Vec<serde_json::Value> = rows.into_iter().map(|row| {
                json!({
                    "id": row.get::<Uuid, _>("id"),
                    "name": row.get::<String, _>("name"),
                    "description": row.get::<Option<String>, _>("description"),
                    "status": row.get::<Option<String>, _>("status"),
                    "created_date": row.get::<chrono::DateTime<Utc>, _>("date_entered"),
                    "modified_date": row.get::<chrono::DateTime<Utc>, _>("date_modified")
                })
            }).collect();
            
            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "data": projects
            })))
        },
        Err(e) => {
            println!("Error fetching projects: {e}");
            // Return empty array if database query fails
            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "data": []
            })))
        }
    }
}

async fn create_project(
    data: web::Data<Arc<ApiState>>,
    req: web::Json<CreateProjectRequest>,
) -> Result<HttpResponse> {
    let db = match &data.db {
        Some(db) => db,
        None => {
            return Ok(HttpResponse::ServiceUnavailable().json(json!({
                "error": "Database not available. Server started without database connection."
            })));
        }
    };
    
    let id = Uuid::new_v4();
    let now = Utc::now();
    
    // Parse date strings into NaiveDate
    let start_date = req.estimated_start_date.as_ref()
        .and_then(|s| if s.is_empty() { None } else { Some(s) })
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    
    let end_date = req.estimated_end_date.as_ref()
        .and_then(|s| if s.is_empty() { None } else { Some(s) })
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    
    let result = sqlx::query(
        r#"
        INSERT INTO projects (
            id, name, description, status, 
            estimated_start_date, estimated_end_date,
            date_entered, date_modified, created_by, modified_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.status)
    .bind(start_date)
    .bind(end_date)
    .bind(now)
    .bind(now)
    .bind("1") // Default user ID
    .bind("1") // Default user ID
    .execute(db)
    .await;
    
    match result {
        Ok(_) => Ok(HttpResponse::Created().json(json!({
            "id": id.to_string(),
            "message": "Project created successfully"
        }))),
        Err(e) => Ok(HttpResponse::BadRequest().json(json!({
            "error": e.to_string()
        }))),
    }
}

// Initialize database schema (simplified version with core tables)
async fn init_database(pool: &Pool<Postgres>) -> anyhow::Result<()> {
    // Create users table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_name VARCHAR(60),
            first_name VARCHAR(30),
            last_name VARCHAR(30),
            email VARCHAR(100),
            status VARCHAR(100),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#
    ).execute(pool).await?;
    
    // Create accounts table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(150),
            account_type VARCHAR(50),
            industry VARCHAR(50),
            phone_office VARCHAR(100),
            website VARCHAR(255),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create contacts table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS contacts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            salutation VARCHAR(255),
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            title VARCHAR(100),
            department VARCHAR(255),
            account_id UUID REFERENCES accounts(id),
            phone_work VARCHAR(100),
            phone_mobile VARCHAR(100),
            email VARCHAR(100),
            primary_address_street VARCHAR(150),
            primary_address_city VARCHAR(100),
            primary_address_state VARCHAR(100),
            primary_address_postalcode VARCHAR(20),
            primary_address_country VARCHAR(255),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create projects table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50),
            description TEXT,
            status VARCHAR(50),
            priority VARCHAR(255),
            estimated_start_date DATE,
            estimated_end_date DATE,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create opportunities table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS opportunities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50),
            account_id UUID REFERENCES accounts(id),
            opportunity_type VARCHAR(255),
            lead_source VARCHAR(50),
            amount DECIMAL(26,6),
            currency_id VARCHAR(36),
            date_closed DATE,
            sales_stage VARCHAR(255),
            probability DECIMAL(3,0),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create activities table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS activities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255),
            date_due TIMESTAMP WITH TIME ZONE,
            date_start TIMESTAMP WITH TIME ZONE,
            parent_type VARCHAR(255),
            parent_id UUID,
            status VARCHAR(100),
            priority VARCHAR(255),
            description TEXT,
            contact_id UUID REFERENCES contacts(id),
            account_id UUID REFERENCES accounts(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create leads table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS leads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            salutation VARCHAR(255),
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            title VARCHAR(100),
            company VARCHAR(100),
            phone_work VARCHAR(100),
            phone_mobile VARCHAR(100),
            email VARCHAR(100),
            status VARCHAR(100),
            lead_source VARCHAR(100),
            description TEXT,
            converted BOOLEAN DEFAULT false,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create campaigns table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS campaigns (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50),
            campaign_type VARCHAR(100),
            status VARCHAR(100),
            start_date DATE,
            end_date DATE,
            budget DECIMAL(26,6),
            expected_cost DECIMAL(26,6),
            actual_cost DECIMAL(26,6),
            expected_revenue DECIMAL(26,6),
            objective TEXT,
            content TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create documents table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_name VARCHAR(255),
            filename VARCHAR(255),
            file_ext VARCHAR(100),
            file_mime_type VARCHAR(100),
            revision VARCHAR(100),
            category_id VARCHAR(100),
            subcategory_id VARCHAR(100),
            status VARCHAR(100),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create events table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255),
            date_start TIMESTAMP WITH TIME ZONE,
            date_end TIMESTAMP WITH TIME ZONE,
            duration_hours INTEGER,
            duration_minutes INTEGER,
            location VARCHAR(255),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create products table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50),
            product_code VARCHAR(50),
            category VARCHAR(100),
            manufacturer VARCHAR(50),
            cost DECIMAL(26,6),
            price DECIMAL(26,6),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create roles table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(150),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create calls table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS calls (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50),
            date_start TIMESTAMP WITH TIME ZONE,
            date_end TIMESTAMP WITH TIME ZONE,
            duration_hours INTEGER,
            duration_minutes INTEGER,
            status VARCHAR(100),
            direction VARCHAR(100),
            parent_type VARCHAR(255),
            parent_id UUID,
            contact_id UUID REFERENCES contacts(id),
            account_id UUID REFERENCES accounts(id),
            description TEXT,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create surveyquestionoptions table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS surveyquestionoptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50),
            survey_question_id UUID,
            sort_order INTEGER,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36),
            modified_user_id VARCHAR(36)
        )
        "#
    ).execute(pool).await?;
    
    // Create tags table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#
    ).execute(pool).await?;
    
    // Create taggables table (polymorphic relationship)
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS taggables (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tag_id UUID REFERENCES tags(id),
            taggable_type VARCHAR(100),
            taggable_id UUID,
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tag_id, taggable_type, taggable_id)
        )
        "#
    ).execute(pool).await?;
    
    // Create relationship tables
    
    // User roles relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            role_id UUID REFERENCES roles(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, role_id)
        )
        "#
    ).execute(pool).await?;
    
    // Account contacts relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS accounts_contacts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID REFERENCES accounts(id),
            contact_id UUID REFERENCES contacts(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, contact_id)
        )
        "#
    ).execute(pool).await?;
    
    // Account opportunities relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS accounts_opportunities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID REFERENCES accounts(id),
            opportunity_id UUID REFERENCES opportunities(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, opportunity_id)
        )
        "#
    ).execute(pool).await?;
    
    // Contact opportunities relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS contacts_opportunities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            contact_id UUID REFERENCES contacts(id),
            opportunity_id UUID REFERENCES opportunities(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(contact_id, opportunity_id)
        )
        "#
    ).execute(pool).await?;
    
    // Campaign leads relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS campaigns_leads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID REFERENCES campaigns(id),
            lead_id UUID REFERENCES leads(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(campaign_id, lead_id)
        )
        "#
    ).execute(pool).await?;
    
    // Project contacts relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS projects_contacts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID REFERENCES projects(id),
            contact_id UUID REFERENCES contacts(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, contact_id)
        )
        "#
    ).execute(pool).await?;
    
    // Project accounts relationship
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS projects_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID REFERENCES projects(id),
            account_id UUID REFERENCES accounts(id),
            date_entered TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, account_id)
        )
        "#
    ).execute(pool).await?;
    
    println!("Database schema initialized successfully!");
    Ok(())
}

// Helper functions for database admin endpoints
async fn test_db_connection(pool: &Pool<Postgres>) -> Result<ConnectionInfo, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT 
            version() as server_version,
            current_database() as database_name,
            current_user as current_user,
            (SELECT count(*) FROM pg_stat_activity) as connection_count
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(ConnectionInfo {
        server_version: row.get("server_version"),
        database_name: row.get("database_name"),
        current_user: row.get("current_user"),
        connection_count: row.get("connection_count"),
    })
}

async fn get_database_tables(pool: &Pool<Postgres>, limit: Option<i32>, connection_name: Option<&String>) -> Result<Vec<TableInfoDetailed>, sqlx::Error> {
    let query = if let Some(limit_val) = limit {
        format!(
            r#"
            SELECT 
                table_name,
                (
                    SELECT reltuples::bigint 
                    FROM pg_class 
                    WHERE relname = table_name
                ) as estimated_rows
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
            ORDER BY table_name
            LIMIT {limit_val}
            "#
        )
    } else {
        r#"
        SELECT 
            table_name,
            (
                SELECT reltuples::bigint 
                FROM pg_class 
                WHERE relname = table_name
            ) as estimated_rows
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        ORDER BY table_name
        "#.to_string()
    };
    
    let rows = sqlx::query(&query)
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();
    for row in rows {
        let table_name: String = row.get("table_name");
        let estimated_rows: Option<i64> = row.get("estimated_rows");
        
        // Filter tables for EXIOBASE connection - only include valid tables
        if let Some(conn_name) = connection_name {
            if conn_name == "EXIOBASE" {
                let valid_tables = ["trade", "industry", "factor", "trade_factor", "interstate", "interstate_factor"];
                if !valid_tables.contains(&table_name.as_str()) {
                    continue; // Skip tables not in the valid list
                }
            }
        }
        
        // Add description based on table name
        let description = get_table_description(&table_name);
        
        tables.push(TableInfoDetailed {
            name: table_name,
            rows: estimated_rows,
            description,
        });
    }

    Ok(tables)
}

async fn get_table_details(pool: &Pool<Postgres>, table_name: &str) -> Result<HashMap<String, serde_json::Value>, sqlx::Error> {
    // Get basic table info
    let row = sqlx::query(
        r#"
        SELECT 
            (SELECT reltuples::bigint FROM pg_class WHERE relname = $1) as estimated_rows,
            (SELECT count(*) FROM information_schema.columns WHERE table_name = $1) as column_count
        "#,
    )
    .bind(table_name)
    .fetch_one(pool)
    .await?;

    // Get column information
    let column_rows = sqlx::query(
        r#"
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
        "#,
    )
    .bind(table_name)
    .fetch_all(pool)
    .await?;

    let mut columns = Vec::new();
    for col_row in column_rows {
        let mut column_info = serde_json::Map::new();
        column_info.insert("name".to_string(), serde_json::Value::String(col_row.get::<String, _>("column_name")));
        column_info.insert("type".to_string(), serde_json::Value::String(col_row.get::<String, _>("data_type")));
        column_info.insert("nullable".to_string(), serde_json::Value::String(col_row.get::<String, _>("is_nullable")));
        
        if let Some(default_value) = col_row.get::<Option<String>, _>("column_default") {
            column_info.insert("default".to_string(), serde_json::Value::String(default_value));
        }
        
        if let Some(max_length) = col_row.get::<Option<i32>, _>("character_maximum_length") {
            column_info.insert("max_length".to_string(), serde_json::json!(max_length));
        }
        
        columns.push(serde_json::Value::Object(column_info));
    }

    let mut info = HashMap::new();
    info.insert("table_name".to_string(), serde_json::Value::String(table_name.to_string()));
    info.insert("estimated_rows".to_string(), serde_json::json!(row.get::<Option<i64>, _>("estimated_rows")));
    info.insert("column_count".to_string(), serde_json::json!(row.get::<i64, _>("column_count")));
    info.insert("description".to_string(), serde_json::Value::String(
        get_table_description(table_name).unwrap_or_else(|| "No description available".to_string())
    ));
    info.insert("columns".to_string(), serde_json::Value::Array(columns));

    Ok(info)
}

async fn execute_safe_query(pool: &Pool<Postgres>, query: &str) -> Result<serde_json::Value, sqlx::Error> {
    let rows = sqlx::query(query).fetch_all(pool).await?;

    let mut results = Vec::new();
    for row in rows {
        let mut row_map = serde_json::Map::new();

        for (i, column) in row.columns().iter().enumerate() {
            let type_name = column.type_info().name().to_lowercase();

            let value = match row.try_get_raw(i) {
                Ok(raw) if raw.is_null() => serde_json::Value::Null,
                Ok(_) => {
                    if type_name.contains("int") || type_name == "serial" || type_name == "bigserial" {
                        if let Ok(v) = row.try_get::<i64, _>(i) { json!(v) }
                        else if let Ok(v) = row.try_get::<i32, _>(i) { json!(v) }
                        else if let Ok(v) = row.try_get::<i16, _>(i) { json!(v) }
                        else { serde_json::Value::Null }
                    } else if type_name == "float4" || type_name == "real" {
                        if let Ok(v) = row.try_get::<f32, _>(i) { json!(v) }
                        else { serde_json::Value::Null }
                    } else if type_name == "float8" || type_name == "double precision"
                           || type_name == "numeric" || type_name == "decimal" {
                        if let Ok(v) = row.try_get::<f64, _>(i) { json!(v) }
                        else { serde_json::Value::Null }
                    } else if type_name == "bool" || type_name == "boolean" {
                        if let Ok(v) = row.try_get::<bool, _>(i) { json!(v) }
                        else { serde_json::Value::Null }
                    } else if type_name == "uuid" {
                        if let Ok(v) = row.try_get::<Uuid, _>(i) { json!(v.to_string()) }
                        else { serde_json::Value::Null }
                    } else if type_name.starts_with("timestamp") {
                        if let Ok(v) = row.try_get::<chrono::DateTime<Utc>, _>(i) { json!(v.to_rfc3339()) }
                        else if let Ok(v) = row.try_get::<NaiveDateTime, _>(i) { json!(v.to_string()) }
                        else { serde_json::Value::Null }
                    } else if type_name == "date" {
                        if let Ok(v) = row.try_get::<NaiveDate, _>(i) { json!(v.to_string()) }
                        else { serde_json::Value::Null }
                    } else if type_name == "json" || type_name == "jsonb" {
                        if let Ok(v) = row.try_get::<serde_json::Value, _>(i) { v }
                        else { serde_json::Value::Null }
                    } else {
                        match row.try_get::<String, _>(i) {
                            Ok(s) => json!(s),
                            Err(_) => serde_json::Value::Null,
                        }
                    }
                }
                Err(_) => serde_json::Value::Null,
            };

            row_map.insert(column.name().to_string(), value);
        }

        results.push(serde_json::Value::Object(row_map));
    }

    Ok(serde_json::Value::Array(results))
}

fn get_table_description(table_name: &str) -> Option<String> {
    match table_name {
        "accounts" => Some("Customer accounts and organizations".to_string()),
        "contacts" => Some("Individual contact records".to_string()),
        "users" => Some("System users and administrators".to_string()),
        "opportunities" => Some("Sales opportunities and deals".to_string()),
        "cases" => Some("Customer support cases".to_string()),
        "leads" => Some("Sales leads and prospects".to_string()),
        "campaigns" => Some("Marketing campaigns".to_string()),
        "meetings" => Some("Scheduled meetings and appointments".to_string()),
        "calls" => Some("Phone calls and communications".to_string()),
        "tasks" => Some("Tasks and activities".to_string()),
        "projects" => Some("Project management records".to_string()),
        "project_task" => Some("Individual project tasks".to_string()),
        "documents" => Some("Document attachments and files".to_string()),
        "emails" => Some("Email communications".to_string()),
        "notes" => Some("Notes and comments".to_string()),
        "activities" => Some("Activities and tasks".to_string()),
        "surveyquestionoptions" => Some("Survey question options".to_string()),
        "tags" => Some("Tags for categorization".to_string()),
        "taggables" => Some("Polymorphic tag relationships".to_string()),
        "roles" => Some("User roles and permissions".to_string()),
        // EXIOBASE tables
        "trade" => Some("International trade flow data (domestic + imports + exports)".to_string()),
        "industry" => Some("Industry sector classifications and data".to_string()),
        "factor" => Some("Environmental and social impact factors".to_string()),
        "interstate" => Some("US BEA state-to-state trade flows".to_string()),
        "interstate_factor" => Some("State-level environmental factor flows".to_string()),
        "trade_factor" => Some("Trade flow with environmental factors".to_string()),
        _ => None,
    }
}

// Run the API server
async fn run_api_server(config: Config) -> anyhow::Result<()> {
    println!("Attempting to connect to database: {}", &config.database_url);
    
    let pool = match PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
    {
        Ok(pool) => {
            println!("Database connection successful!");
            Some(pool)
        }
        Err(e) => {
            println!("Warning: Failed to connect to database: {}", e);
            println!("Server will start without database functionality.");
            println!("OAuth and other features will work normally.");
            None
        }
    };
    
    // Create shared config for hot reloading
    let shared_config = Arc::new(Mutex::new(config));
    
    // Start watching .env file for changes
    if let Err(e) = start_env_watcher(shared_config.clone()) {
        log::warn!("Failed to start .env file watcher: {e}");
    }
    
    let state = Arc::new(ApiState {
        db: pool,
        config: shared_config.clone(),
    });
    
    // Create persistent Claude session manager
    let claude_session_manager: ClaudeSessionManager = Arc::new(Mutex::new(ClaudeSession::new()));

    // Create API integration config for Cognito Forms
    let cognito_config = api_integration::ApiConfig::cognito_forms();

    // Get server config from shared config
    let (server_host, server_port) = {
        let config_guard = shared_config.lock().unwrap();
        (config_guard.server_host.clone(), config_guard.server_port)
    };
    
    println!("Starting API server on {server_host}:{server_port}");
    let session_manager_clone = claude_session_manager.clone();
    
    let cognito_config_clone = cognito_config.clone();

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(web::Data::new(state.clone()))
            .app_data(web::Data::new(session_manager_clone.clone()))
            .app_data(web::Data::new(cognito_config_clone.clone()))
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .service(
                web::scope("/api")
                    .route("/health", web::get().to(health_check))
                    .route("/tables", web::get().to(get_tables))
                    .route("/tables/mock", web::get().to(get_tables_mock))
                    .route("/projects", web::get().to(get_projects))
                    .route("/projects", web::post().to(create_project))
                    .service(
                        web::scope("/db")
                            .route("/test-connection", web::get().to(db_test_connection))
                            .route("/test-commons-connection", web::get().to(db_test_commons_connection))
                            .route("/test-exiobase-connection", web::get().to(db_test_exiobase_connection))
                            .route("/test-locations-connection", web::get().to(db_test_location_connection))
                            .route("/tables", web::get().to(db_list_tables))
                            .route("/table/{table_name}", web::get().to(db_get_table_info))
                            .route("/table-rows", web::post().to(db_get_table_rows))
                            .route("/query", web::post().to(db_execute_query))
                            .route("/init-industry-tables", web::post().to(db_init_industry_tables))
                            .route("/insert-trade-data", web::post().to(db_insert_trade_data))
                            .route("/industry-schema", web::get().to(db_get_industry_schema))
                    )
                    .service(
                        web::scope("/import")
                            .route("/excel", web::post().to(import::import_excel_data))
                            .route("/excel/preview", web::post().to(import::preview_excel_data))
                            .route("/excel/sheets", web::post().to(import::get_excel_sheets))
                            .route("/data", web::post().to(import::import_data))
                            .route("/democracylab", web::post().to(import::import_democracylab_projects))
                    )
                    .service(
                        web::scope("/claude")
                            .route("/usage/cli", web::get().to(get_claude_usage_cli))
                            .route("/usage/website", web::get().to(get_claude_usage_website))
                            .route("/analyze", web::post().to(claude_insights::analyze_with_claude_cli))
                    )
                    .service(
                        web::scope("/gemini")
                            .route("/usage/cli", web::get().to(get_gemini_usage_cli))
                            .route("/usage/website", web::get().to(get_gemini_usage_website))
                            .route("/analyze", web::post().to(gemini_insights::analyze_with_gemini))
                    )
                    .service(
                        web::scope("/insights")
                            .route("/analyze", web::post().to(unified_insights::analyze_with_llm))
                    )
                    .service(
                        web::scope("/github")
                            .route("/token", web::get().to(get_github_token))
                    )
                    .service(
                        web::scope("/github-cli")
                            .route("/status", web::get().to(get_github_cli_status))
                    )
                    .service(
                        web::scope("/semantic-search")
                            .route("", web::post().to(semantic_search::search_projects))
                    )
                    .service(
                        web::scope("/google")
                            .route("/create-project", web::post().to(create_google_project))
                            .service(
                                web::scope("/auth")
                                    .route("/verify", web::post().to(verify_google_auth))
                            )
                            .service(
                                web::scope("/sheets")
                                    .route("/config", web::get().to(get_sheets_config))
                                    .route("/config", web::post().to(save_sheets_config))
                                    .route("/member/{email}", web::get().to(get_member_by_email))
                                    .route("/member", web::post().to(save_member_data))
                                    .route("/member", web::put().to(save_member_data))
                            )
                            .service(
                                web::scope("/gemini")
                                    .route("/analyze", web::post().to(gemini_insights::analyze_with_gemini))
                            )
                    )
                    .service(
                        web::scope("/config")
                            .route("/current", web::get().to(get_current_config))
                            .route("/env", web::get().to(get_env_config))
                            .route("/env", web::post().to(save_env_config))
                            .route("/env/create", web::post().to(create_env_config))
                            .route("/gemini", web::get().to(gemini_insights::test_gemini_api))
                            .route("/restart", web::post().to(restart_server))
                            .route("/stop-webroot", web::post().to(stop_webroot_server))
                    )
                    .service(
                        web::scope("/files")
                            .route("/csv", web::post().to(save_csv_file))
                    )
                    .service(
                        web::scope("/proxy")
                            .route("/csv", web::post().to(fetch_csv))
                            .route("/external", web::post().to(proxy_external_request))
                            .route("/hdf5", web::post().to(proxy_hdf5_file))
                    )
                    .route("/scrape", web::get().to(scrape_site))
                    .route("/admin/git", web::post().to(run_git_script))
                    .service(
                        web::scope("/recommendations")
                            .route("", web::post().to(get_recommendations_handler))
                    )
                    .service(
                        web::scope("/auth")
                            .route("/user", web::get().to(get_current_user))
                            .route("/logout", web::post().to(logout_user))
                            .route("/demo/login", web::post().to(demo_login))
                            .route("/{provider}/url", web::get().to(oauth_provider_url))
                            .route("/{provider}/callback", web::get().to(oauth_provider_callback))
                    )
                    .service(
                        web::scope("/google")
                            .route("/projects", web::get().to(get_google_cloud_projects))
                            .route("/projects/mock", web::get().to(get_google_cloud_projects_mock))
                    )
                    .service(
                        web::scope("/cognito")
                            .route("/test", web::get().to(api_integration::test_connection))
                            .route("/forms", web::get().to(api_integration::list_forms))
                            .route("/forms/{form_id}/entries", web::get().to(api_integration::get_form_entries))
                            .route("/proxy", web::get().to(api_integration::proxy_cognito_request))
                    )
                    .route("/refresh-local", web::post().to(api_integration::refresh_local_file))
                    .route("/save-dataset", web::post().to(api_integration::save_dataset))
            )
    })
    .bind((server_host, server_port))?
    .run()
    .await?;

    Ok(())
}

// Function to get persistent Claude CLI usage data
async fn get_claude_cli_usage_persistent(session_manager: ClaudeSessionManager) -> anyhow::Result<serde_json::Value> {
    let mut session = session_manager.lock().unwrap();
    
    // Check if we need to start a new session
    if !session.is_active() {
        println!("Starting new persistent Claude CLI session...");
        session.prompt_count = 0;
        session.total_input_tokens = 0;
        session.total_output_tokens = 0;
    }
    
    // Increment prompt count for this session
    session.prompt_count += 1;
    let current_prompt_count = session.prompt_count;
    
    // Send a small prompt to get current usage data
    let prompt = format!("This is prompt #{current_prompt_count} in our persistent session. What is 2+2?");
    
    println!("Sending prompt #{current_prompt_count} to Claude CLI persistent session...");
    
    // Execute Claude CLI command with JSON output
    let output = Command::new("claude")
        .arg("--print")
        .arg("--output-format")
        .arg("json")
        .arg(&prompt)
        .output()
        .context("Failed to execute claude command. Make sure Claude CLI is installed and accessible.")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Claude CLI command failed: {stderr}"));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout_str = stdout.trim();
    
    if stdout_str.is_empty() {
        return Err(anyhow::anyhow!("Claude CLI returned empty response"));
    }
    
    // Parse the JSON response
    if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(stdout_str) {
        // Extract usage information if available
        if let Some(usage) = json_data.get("usage") {
            println!("Found usage data in Claude CLI response: {usage:?}");
            
            // Update session tracking with new usage data
            if let Some(input_tokens) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
                session.total_input_tokens = input_tokens as u32;
            }
            if let Some(output_tokens) = usage.get("output_tokens").and_then(|v| v.as_u64()) {
                session.total_output_tokens += output_tokens as u32; // Accumulate output tokens
            }
            
            // Store the latest usage data
            session.last_usage = Some(usage.clone());
            
            // Create enhanced usage data with session info
            let enhanced_usage = json!({
                "input_tokens": usage.get("input_tokens").unwrap_or(&json!(0)),
                "output_tokens": usage.get("output_tokens").unwrap_or(&json!(0)),
                "cache_creation_input_tokens": usage.get("cache_creation_input_tokens").unwrap_or(&json!(0)),
                "cache_read_input_tokens": usage.get("cache_read_input_tokens").unwrap_or(&json!(0)),
                "service_tier": usage.get("service_tier").unwrap_or(&json!("standard")),
                "session_info": {
                    "prompt_count": current_prompt_count,
                    "session_duration_seconds": session.get_session_duration(),
                    "total_accumulated_output_tokens": session.total_output_tokens,
                    "session_start_timestamp": session.session_start
                }
            });
            
            return Ok(enhanced_usage);
        }
        
        // If no usage field, create session status
        let usage_data = json!({
            "connection_status": "connected",
            "session_info": {
                "prompt_count": current_prompt_count,
                "session_duration_seconds": session.get_session_duration(),
                "total_accumulated_output_tokens": session.total_output_tokens,
                "session_start_timestamp": session.session_start
            },
            "note": "Claude CLI is connected and working, but usage data is not available through the CLI"
        });
        
        println!("Claude CLI persistent session active, returning status: {usage_data:?}");
        return Ok(usage_data);
    }
    
    // If JSON parsing fails, Claude CLI might not be working properly
    Err(anyhow::anyhow!("Claude CLI response could not be parsed as JSON: {stdout_str}"))
}

// Fallback function for non-persistent usage (keeping for compatibility)
async fn get_claude_cli_usage() -> anyhow::Result<serde_json::Value> {
    println!("Using fallback one-time Claude CLI request...");
    
    let output = Command::new("claude")
        .arg("--print")
        .arg("--output-format")
        .arg("json")
        .arg("What is 1+1?")
        .output()
        .context("Failed to execute claude command")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Claude CLI command failed: {stderr}"));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout_str = stdout.trim();
    
    if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(stdout_str) {
        if let Some(usage) = json_data.get("usage") {
            return Ok(usage.clone());
        }
    }
    
    Err(anyhow::anyhow!("Could not extract usage data"))
}


// Handlers for Claude usage - get real data from persistent Claude CLI session
async fn get_claude_usage_cli(session_manager: web::Data<ClaudeSessionManager>) -> Result<HttpResponse> {
    match get_claude_cli_usage_persistent(session_manager.get_ref().clone()).await {
        Ok(usage_data) => Ok(HttpResponse::Ok().json(json!({
            "success": true,
            "usage": usage_data
        }))),
        Err(e) => {
            // Fall back to one-time request if persistent session fails
            println!("Persistent session failed, falling back to one-time request: {e}");
            match get_claude_cli_usage().await {
                Ok(fallback_data) => Ok(HttpResponse::Ok().json(json!({
                    "success": true,
                    "usage": fallback_data
                }))),
                Err(fallback_e) => Ok(HttpResponse::Ok().json(json!({
                    "success": false,
                    "error": format!("Failed to get Claude CLI usage: {fallback_e}")
                })))
            }
        }
    }
}

async fn get_claude_usage_website(session_manager: web::Data<ClaudeSessionManager>) -> Result<HttpResponse> {
    // For website usage, we'll use the same persistent CLI session since that's what's available
    match get_claude_cli_usage_persistent(session_manager.get_ref().clone()).await {
        Ok(usage_data) => Ok(HttpResponse::Ok().json(json!({
            "success": true,
            "usage": usage_data
        }))),
        Err(e) => {
            // Fall back to one-time request if persistent session fails  
            println!("Persistent session failed, falling back to one-time request: {e}");
            match get_claude_cli_usage().await {
                Ok(fallback_data) => Ok(HttpResponse::Ok().json(json!({
                    "success": true,
                    "usage": fallback_data
                }))),
                Err(fallback_e) => Ok(HttpResponse::Ok().json(json!({
                    "success": false,
                    "error": format!("Failed to get Claude usage: {fallback_e}")
                })))
            }
        }
    }
}

async fn get_gemini_usage_cli() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({
        "success": false,
        "error": "Gemini CLI not connected or not available"
    })))
}

async fn get_gemini_usage_website() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({
        "success": false,
        "error": "Gemini website API not configured"
    })))
}

// Scrape site for Open Graph data and images
#[derive(Deserialize)]
struct ScrapeRequest {
    url: String,
}

#[derive(Serialize)]
struct ScrapeResponse {
    image: Option<String>,
    title: Option<String>,
    description: Option<String>,
}

async fn scrape_site(req: web::Query<ScrapeRequest>) -> Result<HttpResponse> {
    let url = &req.url;
    
    // Basic URL validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "Invalid URL format"
        })));
    }
    
    // Build a client with proper headers to mimic a real browser
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to build HTTP client"))?;
    
    // Fetch the page content
    match client.get(url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.text().await {
                    Ok(html) => {
                        println!("Successfully fetched URL: {}, HTML length: {}", url, html.len());
                        
                        // Parse HTML to extract Open Graph data
                        let mut image = None;
                        let mut title = None;
                        let mut description = None;
                        
                        // Simple regex-based parsing for Open Graph tags
                        if let Some(og_image) = extract_meta_property(&html, "og:image") {
                            println!("Found og:image: {}", og_image);
                            // Make sure image URL is absolute
                            if og_image.starts_with("//") {
                                image = Some(format!("https:{}", og_image));
                            } else if og_image.starts_with("/") {
                                if let Ok(parsed_url) = url::Url::parse(url) {
                                    if let Some(domain) = parsed_url.domain() {
                                        let scheme = parsed_url.scheme();
                                        image = Some(format!("{}://{}{}", scheme, domain, og_image));
                                    }
                                }
                            } else if og_image.starts_with("http") {
                                image = Some(og_image);
                            }
                        }
                        
                        // Extract title
                        if let Some(og_title) = extract_meta_property(&html, "og:title") {
                            println!("Found og:title: {}", og_title);
                            title = Some(og_title);
                        } else if let Some(html_title) = extract_html_title(&html) {
                            println!("Found HTML title: {}", html_title);
                            title = Some(html_title);
                        }
                        
                        // Extract description
                        if let Some(og_desc) = extract_meta_property(&html, "og:description") {
                            println!("Found og:description: {}", og_desc);
                            description = Some(og_desc);
                        }
                        
                        let response_json = ScrapeResponse {
                            image: image.clone(),
                            title: title.clone(),
                            description: description.clone(),
                        };
                        
                        println!("Returning scrape response: image={:?}, title={:?}", image, title);
                        Ok(HttpResponse::Ok().json(response_json))
                    }
                    Err(err) => {
                        println!("Failed to read response content: {}", err);
                        Ok(HttpResponse::InternalServerError().json(json!({
                            "error": "Failed to read response content"
                        })))
                    }
                }
            } else {
                println!("HTTP error response: {}", response.status());
                Ok(HttpResponse::BadRequest().json(json!({
                    "error": format!("HTTP error: {}", response.status())
                })))
            }
        }
        Err(err) => {
            println!("Failed to fetch URL {}: {}", url, err);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": format!("Failed to fetch URL: {}", err)
            })))
        }
    }
}

// Helper function to extract Open Graph meta property content
fn extract_meta_property(html: &str, property: &str) -> Option<String> {
    let pattern = format!(r#"<meta\s+property\s*=\s*["']{}["'][^>]*content\s*=\s*["']([^"']+)["']"#, regex::escape(property));
    if let Ok(re) = regex::Regex::new(&pattern) {
        if let Some(caps) = re.captures(html) {
            return caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    
    // Try alternative format: content first, then property
    let pattern_alt = format!(r#"<meta\s+content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']{}["']"#, regex::escape(property));
    if let Ok(re) = regex::Regex::new(&pattern_alt) {
        if let Some(caps) = re.captures(html) {
            return caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    
    None
}

// Helper function to extract HTML title
fn extract_html_title(html: &str) -> Option<String> {
    if let Ok(re) = regex::Regex::new(r"<title[^>]*>([^<]+)</title>") {
        if let Some(caps) = re.captures(html) {
            return caps.get(1).map(|m| m.as_str().trim().to_string());
        }
    }
    None
}

// Admin: run git.sh script (protected by ADMIN_KEY env var)
#[derive(Serialize)]
struct ScriptResult {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
    error: Option<String>,
}

#[derive(Deserialize)]
struct RunGitRequest {
    // allowed actions: "push" | "pull" (optional)
    action: Option<String>,
}

async fn run_git_script(req: HttpRequest, body: web::Json<RunGitRequest>) -> Result<HttpResponse> {
    // Authenticate using a GitHub token passed by the client.
    // Accept token in `Authorization` header (Bearer or token) or `x-github-token`.
    // Validate token by calling GitHub API /user. If valid, pass it to the script as GITHUB_TOKEN
    // so the server-side script can use it for HTTPS git operations.
    let header_token = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| req.headers().get("x-github-token").and_then(|v| v.to_str().ok()).map(|s| s.to_string()));

    let token = if let Some(mut t) = header_token {
        // strip common prefixes
        if t.to_lowercase().starts_with("bearer ") {
            t = t[7..].to_string();
        } else if t.to_lowercase().starts_with("token ") {
            t = t[6..].to_string();
        }
        Some(t)
    } else {
        None
    };

    if token.is_none() {
        return Ok(HttpResponse::Unauthorized().json(ScriptResult {
            success: false,
            code: None,
            stdout: "".into(),
            stderr: "".into(),
            error: Some("Missing GitHub token in Authorization or x-github-token header".into()),
        }));
    }

    // Validate token with GitHub API (/user)
    let gh_token = token.unwrap();
    let client = reqwest::Client::new();
    let gh_resp = client
        .get("https://api.github.com/user")
        .header("User-Agent", "partner-tools")
        .bearer_auth(&gh_token)
        .send()
        .await;

    match gh_resp {
        Ok(r) if r.status().is_success() => {
            // token validated
        }
        Ok(r) => {
            return Ok(HttpResponse::Unauthorized().json(ScriptResult {
                success: false,
                code: None,
                stdout: "".into(),
                stderr: format!("GitHub token rejected (HTTP {})", r.status()),
                error: Some("Invalid GitHub token".into()),
            }));
        }
        Err(e) => {
            return Ok(HttpResponse::InternalServerError().json(ScriptResult {
                success: false,
                code: None,
                stdout: "".into(),
                stderr: format!("Failed to validate token: {}", e),
                error: Some("Token validation failed".into()),
            }));
        }
    }

    // Determine repo dir and script path from env (safe defaults)
    let repo_dir = std::env::var("WEBROOT_DIR").unwrap_or_else(|_| "/Users/sugandhab/Documents/GitHub/webroot".into());
    let script_path = std::env::var("GIT_SCRIPT_PATH").unwrap_or_else(|_| "./git.sh".into());

    // Build command
    let mut cmd = tokio::process::Command::new(&script_path);
    cmd.current_dir(repo_dir);
    // Provide token to the child process so scripts can use it (via env GITHUB_TOKEN)
    cmd.env("GITHUB_TOKEN", &gh_token);

    // Validate and append allowed action arg if provided
    if let Some(act) = body.action.as_ref() {
        let action = act.trim().to_lowercase();
        match action.as_str() {
            "push" | "pull" => {
                cmd.arg(action);
            }
            _ => {
                return Ok(HttpResponse::BadRequest().json(ScriptResult {
                    success: false,
                    code: None,
                    stdout: "".into(),
                    stderr: "".into(),
                    error: Some(format!("Invalid action: {}", action)),
                }));
            }
        }
    }

    // Run with timeout
    match tokio::time::timeout(tokio::time::Duration::from_secs(120), cmd.output()).await {
        Ok(Ok(output)) => {
            let code = output.status.code();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(HttpResponse::Ok().json(ScriptResult {
                success: output.status.success(),
                code,
                stdout,
                stderr,
                error: None,
            }))
        }
        Ok(Err(e)) => Ok(HttpResponse::InternalServerError().json(ScriptResult {
            success: false,
            code: None,
            stdout: "".into(),
            stderr: "".into(),
            error: Some(format!("Failed to run script: {}", e)),
        })),
        Err(_) => Ok(HttpResponse::InternalServerError().json(ScriptResult {
            success: false,
            code: None,
            stdout: "".into(),
            stderr: "".into(),
            error: Some("Timed out".into()),
        })),
    }
}

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let config = Config::from_env()?;
    
    // Check for CLI commands
    let cli = Cli::try_parse();
    match cli {
        Ok(cli) => {
            match cli.command {
                Commands::Serve => {
                    run_api_server(config).await?;
                }
                Commands::InitDb => {
                    println!("Initializing database...");
                    let pool = PgPoolOptions::new()
                        .connect(&config.database_url)
                        .await
                        .context("Failed to connect to database for init")?;
                    init_database(&pool).await?;
                }
            }
        }
        Err(_) => {
            // Default to serve if no command is provided
            run_api_server(config).await?;
        }
    }
    
    Ok(())
}
