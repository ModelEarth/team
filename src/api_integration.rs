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

// Configure routes for external API integration
// Routes are generic and work with any API service configured
pub fn configure_cognito_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/cognito")
            .route("/test", web::get().to(test_connection))
            .route("/forms", web::get().to(list_forms))
            .route("/forms/{form_id}/entries", web::get().to(get_form_entries))
    );
}
