// Generic API Integration module
// Provides reusable patterns for pulling data from external APIs
// Currently supports: Cognito Forms (other services can be added)

use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Generic response structure for API endpoints
#[derive(Serialize)]
pub struct ApiResponse {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
    pub data: Option<serde_json::Value>,
}

// Generic configuration for external API services
#[derive(Clone, Debug)]
pub struct ApiConfig {
    pub service_name: String,
    pub api_key: String,
    pub base_url: String,
}

impl ApiConfig {
    // Create config for Cognito Forms
    pub fn cognito_forms() -> Self {
        let api_key = std::env::var("COGNITO_FORMS_API")
            .unwrap_or_else(|_| "".to_string());

        let base_url = std::env::var("COGNITO_FORMS_BASE_URL")
            .unwrap_or_else(|_| "https://www.cognitoforms.com/api/forms".to_string());

        // Log API key status (show first 20 and last 10 chars for verification)
        if api_key.is_empty() {
            log::warn!("COGNITO_FORMS_API is empty or not set!");
        } else {
            let key_preview = if api_key.len() > 30 {
                format!("{}...{}", &api_key[..20], &api_key[api_key.len()-10..])
            } else {
                "[key too short]".to_string()
            };
            log::info!("Cognito Forms API key loaded: {}", key_preview);
        }

        ApiConfig {
            service_name: "Cognito Forms".to_string(),
            api_key,
            base_url,
        }
    }

    // Generic constructor for other API services
    pub fn new(service_name: &str, api_key_env: &str, base_url_env: &str, default_url: &str) -> Self {
        let api_key = std::env::var(api_key_env)
            .unwrap_or_else(|_| "".to_string());

        let base_url = std::env::var(base_url_env)
            .unwrap_or_else(|_| default_url.to_string());

        ApiConfig {
            service_name: service_name.to_string(),
            api_key,
            base_url,
        }
    }
}

// Form info structure
#[derive(Serialize, Deserialize, Debug)]
pub struct FormInfo {
    #[serde(rename = "Id")]
    pub id: Option<String>,
    #[serde(rename = "InternalName")]
    pub internal_name: Option<String>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
}

// List all forms
pub async fn list_forms(config: web::Data<ApiConfig>) -> Result<HttpResponse> {
    match fetch_forms(&config).await {
        Ok(forms) => Ok(HttpResponse::Ok().json(ApiResponse {
            success: true,
            message: Some(format!("Found {} forms", forms.len())),
            error: None,
            data: Some(serde_json::json!({ "forms": forms })),
        })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiResponse {
            success: false,
            message: None,
            error: Some(format!("Failed to fetch forms: {}", e)),
            data: None,
        })),
    }
}

// Get entries for a specific form
pub async fn get_form_entries(
    config: web::Data<ApiConfig>,
    path: web::Path<String>,
) -> Result<HttpResponse> {
    let form_id = path.into_inner();

    match fetch_form_entries(&config, &form_id).await {
        Ok(entries) => Ok(HttpResponse::Ok().json(ApiResponse {
            success: true,
            message: Some(format!("Found entries for form {}", form_id)),
            error: None,
            data: Some(serde_json::json!({ "entries": entries, "form_id": form_id })),
        })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiResponse {
            success: false,
            message: None,
            error: Some(format!("Failed to fetch entries: {}", e)),
            data: None,
        })),
    }
}

// Test API connection
pub async fn test_connection(config: web::Data<ApiConfig>) -> Result<HttpResponse> {
    match test_api_connection(&config).await {
        Ok(info) => Ok(HttpResponse::Ok().json(ApiResponse {
            success: true,
            message: Some(format!("{} API connection successful", config.service_name)),
            error: None,
            data: Some(info),
        })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiResponse {
            success: false,
            message: None,
            error: Some(format!("Connection failed: {}", e)),
            data: None,
        })),
    }
}

// Helper function to fetch all forms
async fn fetch_forms(config: &ApiConfig) -> Result<Vec<FormInfo>, String> {
    if config.api_key.is_empty() {
        return Err("API key not configured".to_string());
    }

    log::info!("Fetching forms from: {}", config.base_url);
    log::info!("API key present: {}", !config.api_key.is_empty());

    let client = reqwest::Client::new();
    let url = &config.base_url;

    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .send()
        .await
        .map_err(|e| {
            let err_msg = format!("Request failed: {} (url: {})", e, url);
            log::error!("{}", err_msg);
            err_msg
        })?;

    if !response.status().is_success() {
        let err_msg = format!("API returned error status: {} from URL: {}", response.status(), url);
        log::error!("{}", err_msg);
        return Err(err_msg);
    }

    let forms: Vec<FormInfo> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(forms)
}

// Helper function to fetch entries for a specific form
async fn fetch_form_entries(config: &ApiConfig, form_id: &str) -> Result<Vec<serde_json::Value>, String> {
    if config.api_key.is_empty() {
        return Err("API key not configured".to_string());
    }

    let client = reqwest::Client::new();
    let url = format!("{}/{}/entries", config.base_url, form_id);

    log::info!("Fetching entries from: {}", url);
    log::info!("Sending Authorization header with Bearer token");

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .send()
        .await
        .map_err(|e| {
            let err_msg = format!("Request failed: {} (url: {})", e, url);
            log::error!("{}", err_msg);
            err_msg
        })?;

    let status = response.status();
    log::info!("Response status: {}", status);

    if !status.is_success() {
        // Try to get the response body for more details
        let body_text = response.text().await.unwrap_or_else(|_| "Could not read response body".to_string());
        log::error!("Error response body: {}", body_text);
        let err_msg = format!("API returned error status: {} from URL: {}. Response: {}", status, url, body_text);
        return Err(err_msg);
    }

    let entries: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(entries)
}

// Helper function to test API connection
async fn test_api_connection(config: &ApiConfig) -> Result<serde_json::Value, String> {
    if config.api_key.is_empty() {
        return Err("API key not configured".to_string());
    }

    let client = reqwest::Client::new();
    let url = &config.base_url;

    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    let status_code = status.as_u16();

    Ok(serde_json::json!({
        "status": status_code,
        "status_text": status.to_string(),
        "api_url": url,
        "authenticated": status.is_success(),
    }))
}

// Core helper to fetch all entries from Cognito Forms by looping through entry IDs
// Returns the raw entries vector for reuse in multiple endpoints
async fn fetch_cognito_entries_core(config: &ApiConfig, base_url: &str, omit_fields: &[String]) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let mut entries = Vec::new();
    let mut entry_id = 1;

    log::info!("Starting to fetch all entries from: {}", base_url);
    if !omit_fields.is_empty() {
        log::info!("Will omit fields: {:?}", omit_fields);
    }

    loop {
        let url = format!("{}/{}", base_url, entry_id);
        log::info!("Fetching entry #{}: {}", entry_id, url);

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .send()
            .await
            .map_err(|e| format!("Request failed: {} (url: {})", e, url))?;

        let status = response.status();

        // If 404, we've reached the end of entries
        if status.as_u16() == 404 {
            log::info!("Reached end of entries at entry #{}", entry_id);
            break;
        }

        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_else(|_| "Could not read response body".to_string());
            log::warn!("Non-404 error at entry #{}: {} - {}", entry_id, status, body_text);
            break;
        }

        // Parse the entry
        let mut entry: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse entry #{}: {}", entry_id, e))?;

        // Remove specified fields
        if let Some(obj) = entry.as_object_mut() {
            for field in omit_fields {
                obj.remove(field);
            }
        }

        log::info!("Successfully fetched entry #{}", entry_id);
        entries.push(entry);
        entry_id += 1;
    }

    log::info!("Fetched total of {} entries", entries.len());
    Ok(entries)
}

// Fetch all entries from a Cognito Forms endpoint by looping through entry IDs
async fn fetch_all_entries(config: &ApiConfig, base_url: &str) -> Result<HttpResponse> {
    let entries = fetch_cognito_entries_core(config, base_url, &[]).await.map_err(|e| {
        actix_web::error::ErrorInternalServerError(e)
    })?;

    Ok(HttpResponse::Ok().json(ApiResponse {
        success: true,
        message: Some(format!("Successfully fetched {} entries from Cognito Forms", entries.len())),
        error: None,
        data: Some(serde_json::json!(entries)),
    }))
}

// Generic proxy endpoint - accepts full URL and adds authentication
pub async fn proxy_cognito_request(
    config: web::Data<ApiConfig>,
    web::Query(params): web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    // Get the URL from query parameter
    let url = match params.get("url") {
        Some(u) => u,
        None => return Ok(HttpResponse::BadRequest().json(ApiResponse {
            success: false,
            message: None,
            error: Some("Missing 'url' query parameter".to_string()),
            data: None,
        })),
    };

    // Verify it's a Cognito Forms URL for security
    if !url.starts_with("https://www.cognitoforms.com/") {
        return Ok(HttpResponse::BadRequest().json(ApiResponse {
            success: false,
            message: None,
            error: Some("URL must be a Cognito Forms API endpoint".to_string()),
            data: None,
        }));
    }

    log::info!("Proxying Cognito Forms request to: {}", url);

    // Check if URL ends with /entries (no specific entry ID) - means fetch all entries
    if url.ends_with("/entries") {
        log::info!("Detected bulk entries request - will loop through all entries");
        return fetch_all_entries(&config, url).await;
    }

    // Single request for specific resource
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .send()
        .await
        .map_err(|e| {
            let err_msg = format!("Request failed: {} (url: {})", e, url);
            log::error!("{}", err_msg);
            actix_web::error::ErrorInternalServerError(err_msg)
        })?;

    let status = response.status();
    log::info!("Response status: {}", status);

    if !status.is_success() {
        let body_text = response.text().await.unwrap_or_else(|_| "Could not read response body".to_string());
        log::error!("Error response body: {}", body_text);
        let status_code = status.as_u16();
        return Ok(HttpResponse::build(actix_web::http::StatusCode::from_u16(status_code).unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR))
            .json(ApiResponse {
                success: false,
                message: None,
                error: Some(format!("API returned error status: {} from URL: {}. Response: {}", status, url, body_text)),
                data: None,
            }));
    }

    // Get the response as JSON value
    let mut data: serde_json::Value = response.json().await.map_err(|e| {
        let err_msg = format!("Failed to parse response: {}", e);
        log::error!("{}", err_msg);
        actix_web::error::ErrorInternalServerError(err_msg)
    })?;

    // Remove Email field if it exists (for single entry responses)
    if let Some(obj) = data.as_object_mut() {
        obj.remove("Email");
    }

    Ok(HttpResponse::Ok().json(ApiResponse {
        success: true,
        message: Some("Successfully fetched data from Cognito Forms".to_string()),
        error: None,
        data: Some(data),
    }))
}

// Request structure for refresh local endpoint
#[derive(Deserialize)]
pub struct RefreshLocalRequest {
    pub api_url: String,
    pub local_file_path: String,
    #[serde(default)]
    pub omit_fields: Vec<String>,
}

// Helper function to normalize a path by resolving .. and . components
fn normalize_path(path: &std::path::Path) -> std::path::PathBuf {
    use std::path::{Component, PathBuf};

    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {
                // Skip . components
            }
            Component::ParentDir => {
                // Go up one directory (pop last component)
                if !components.is_empty() {
                    components.pop();
                }
            }
            component => {
                // Keep normal components (Prefix, RootDir, Normal)
                components.push(component);
            }
        }
    }

    components.iter().collect()
}

// Refresh local file with data from API
pub async fn refresh_local_file(
    config: web::Data<ApiConfig>,
    req: web::Json<RefreshLocalRequest>,
) -> Result<HttpResponse> {
    let api_url = &req.api_url;
    let local_file_path = &req.local_file_path;

    log::info!("Refreshing local file {} with data from {}", local_file_path, api_url);

    // Check if this is a Cognito Forms URL that needs special handling
    let entries = if api_url.starts_with("https://www.cognitoforms.com") && api_url.ends_with("/entries") {
        // Use the shared core fetch logic for Cognito Forms bulk entries
        log::info!("Detected Cognito Forms bulk entries URL - using fetch_cognito_entries_core");
        fetch_cognito_entries_core(&config, api_url, &req.omit_fields).await.map_err(|e| {
            actix_web::error::ErrorInternalServerError(e)
        })?
    } else {
        // Regular API fetch
        let client = reqwest::Client::new();
        let response = client
            .get(api_url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .send()
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to fetch from API: {}", e);
                log::error!("{}", err_msg);
                actix_web::error::ErrorInternalServerError(err_msg)
            })?;

        let status = response.status();
        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_else(|_| "Could not read response body".to_string());
            let err_msg = format!("API returned error status: {} - {}", status, body_text);
            log::error!("{}", err_msg);
            return Ok(HttpResponse::InternalServerError().json(ApiResponse {
                success: false,
                message: None,
                error: Some(err_msg),
                data: None,
            }));
        }

        // Parse the API response
        let api_response: serde_json::Value = response.json().await.map_err(|e| {
            let err_msg = format!("Failed to parse API response: {}", e);
            log::error!("{}", err_msg);
            actix_web::error::ErrorInternalServerError(err_msg)
        })?;

        // Extract the data array from the API response
        let entries = if let Some(data) = api_response.get("data") {
            if data.is_array() {
                data.as_array().unwrap().clone()
            } else if data.is_object() {
                vec![data.clone()]
            } else {
                vec![]
            }
        } else if api_response.is_array() {
            api_response.as_array().unwrap().clone()
        } else {
            vec![]
        };

        if entries.is_empty() {
            return Ok(HttpResponse::BadRequest().json(ApiResponse {
                success: false,
                message: None,
                error: Some("No data entries found in API response".to_string()),
                data: None,
            }));
        }

        entries
    };

    log::info!("Converting {} entries to CSV", entries.len());

    // Convert JSON entries to CSV
    let csv_data = json_to_csv(&entries).map_err(|e| {
        let err_msg = format!("Failed to convert JSON to CSV: {}", e);
        log::error!("{}", err_msg);
        actix_web::error::ErrorInternalServerError(err_msg)
    })?;

    // Determine the absolute file path
    // Relative paths are relative to team/projects/map/ (where show.json is located)
    let file_path = if local_file_path.starts_with('/') {
        local_file_path.clone()
    } else {
        // Get current working directory (team/)
        let current_dir = std::env::current_dir().map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("Failed to get current directory: {}", e))
        })?;

        // The path is relative to team/projects/map/ where show.json is located
        let show_json_dir = current_dir.join("projects/map");

        // Join the relative path with the show.json directory
        let full_path = show_json_dir.join(local_file_path);

        // Normalize by resolving all .. components
        normalize_path(&full_path).to_string_lossy().to_string()
    };

    log::info!("Writing CSV to file: {}", file_path);

    // Write the CSV data to the file
    std::fs::write(&file_path, csv_data).map_err(|e| {
        let err_msg = format!("Failed to write to file {}: {}", file_path, e);
        log::error!("{}", err_msg);
        actix_web::error::ErrorInternalServerError(err_msg)
    })?;

    log::info!("Successfully wrote {} entries to {}", entries.len(), file_path);

    Ok(HttpResponse::Ok().json(ApiResponse {
        success: true,
        message: Some(format!("Successfully refreshed {} with {} entries", local_file_path, entries.len())),
        error: None,
        data: Some(serde_json::json!({ "entries_count": entries.len(), "file_path": local_file_path })),
    }))
}

// Helper function to convert JSON array to CSV
fn json_to_csv(entries: &Vec<serde_json::Value>) -> Result<String, String> {
    if entries.is_empty() {
        return Err("No entries to convert".to_string());
    }

    // Get all unique keys from all entries
    let mut all_keys = std::collections::HashSet::new();
    for entry in entries {
        if let Some(obj) = entry.as_object() {
            for key in obj.keys() {
                all_keys.insert(key.clone());
            }
        }
    }

    let mut keys: Vec<String> = all_keys.into_iter().collect();
    keys.sort(); // Sort keys alphabetically for consistent column order

    // Build CSV header
    let mut csv = keys.join(",") + "\n";

    // Build CSV rows
    for entry in entries {
        let row: Vec<String> = keys.iter().map(|key| {
            if let Some(obj) = entry.as_object() {
                if let Some(value) = obj.get(key) {
                    // Convert value to string and escape quotes
                    let value_str = match value {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => String::new(),
                        _ => serde_json::to_string(value).unwrap_or_default(),
                    };
                    // Escape quotes and wrap in quotes if contains comma, quote, or newline
                    if value_str.contains(',') || value_str.contains('"') || value_str.contains('\n') {
                        format!("\"{}\"", value_str.replace('"', "\"\""))
                    } else {
                        value_str
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        }).collect();
        csv.push_str(&row.join(","));
        csv.push('\n');
    }

    Ok(csv)
}

// Configure routes for external API integration
// Routes are generic and work with any API service configured
pub fn configure_cognito_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/cognito")
            .route("/test", web::get().to(test_connection))
            .route("/forms", web::get().to(list_forms))
            .route("/forms/{form_id}/entries", web::get().to(get_form_entries))
            .route("/proxy", web::get().to(proxy_cognito_request))  // Generic proxy endpoint
    );
}
