// src/llm_insights.rs
//
// Server-side text analysis for API-key providers (Gemini and OpenAI). The handler, key check,
// error details and response shape are shared; only the wire format differs per provider:
// Gemini passes the key as a query parameter and nests text in contents[].parts[], while OpenAI
// uses a Bearer header and a flat messages[] array (see requests/engine/rust-api/src/providers/).
// Claude has its own module, claude_insights.rs, since it also supports the Claude Code CLI.

use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::ApiState;
use anyhow::Context;

#[derive(Debug, Clone, Copy)]
pub enum LlmProvider {
    Gemini,
    OpenAI,
}

impl LlmProvider {
    fn name(self) -> &'static str {
        match self {
            LlmProvider::Gemini => "Gemini",
            LlmProvider::OpenAI => "OpenAI",
        }
    }

    fn env_var(self) -> &'static str {
        match self {
            LlmProvider::Gemini => "GEMINI_API_KEY",
            LlmProvider::OpenAI => "OPENAI_API_KEY",
        }
    }

    fn model(self) -> &'static str {
        match self {
            LlmProvider::Gemini => "gemini-2.5-flash",
            LlmProvider::OpenAI => "gpt-4o",
        }
    }

    /// Returns the configured key, or None when it is missing or a template placeholder.
    fn api_key(self, data: &web::Data<std::sync::Arc<ApiState>>) -> Option<String> {
        let config_guard = data.config.lock().unwrap();
        let key = match self {
            LlmProvider::Gemini => config_guard.gemini_api_key.clone(),
            LlmProvider::OpenAI => config_guard.openai_api_key.clone(),
        };
        (!crate::is_placeholder_key(&key)).then_some(key)
    }

    /// Endpoint as shown in logs and error details, without the key.
    fn public_url(self) -> String {
        match self {
            LlmProvider::Gemini => format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
                self.model()
            ),
            LlmProvider::OpenAI => "https://api.openai.com/v1/chat/completions".to_string(),
        }
    }

    fn request_body(self, prompt: &str) -> Value {
        match self {
            LlmProvider::Gemini => json!({
                "contents": [{
                    "parts": [{
                        "text": prompt
                    }]
                }],
                "generationConfig": {
                    "temperature": 0.3,
                    "topK": 40,
                    "topP": 0.95,
                    "maxOutputTokens": 8192,
                }
            }),
            LlmProvider::OpenAI => json!({
                "model": self.model(),
                "messages": [{ "role": "user", "content": prompt }],
                "temperature": 0.3,
                "max_completion_tokens": 8192,
            }),
        }
    }

    fn extract_text(self, response: &Value) -> Option<&str> {
        match self {
            LlmProvider::Gemini => response
                .pointer("/candidates/0/content/parts/0/text")
                .and_then(|text| text.as_str()),
            LlmProvider::OpenAI => response
                .pointer("/choices/0/message/content")
                .and_then(|text| text.as_str()),
        }
    }

    fn extract_usage(self, response: &Value) -> Option<TokenUsage> {
        let (usage, prompt_field, completion_field, total_field) = match self {
            LlmProvider::Gemini => (
                response.get("usageMetadata")?,
                "promptTokenCount",
                "candidatesTokenCount",
                "totalTokenCount",
            ),
            LlmProvider::OpenAI => (
                response.get("usage")?,
                "prompt_tokens",
                "completion_tokens",
                "total_tokens",
            ),
        };
        let count = |field: &str| usage.get(field).and_then(|v| v.as_u64()).map(|v| v as u32);
        Some(TokenUsage {
            prompt_tokens: count(prompt_field),
            completion_tokens: count(completion_field),
            total_tokens: count(total_field),
        })
    }
}

#[derive(Debug, Serialize)]
pub struct LlmTestResponse {
    success: bool,
    message: String,
    api_key_present: bool,
    api_key_preview: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LlmAnalysisRequest {
    pub prompt: String,
    #[allow(dead_code)]
    pub data_context: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmAnalysisResponse {
    pub success: bool,
    pub analysis: Option<String>,
    pub error: Option<String>,
    pub error_details: Option<LlmErrorDetails>,
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmErrorDetails {
    pub provider: String,
    pub status_code: u16,
    pub error_type: String,
    pub raw_response: Option<String>,
    pub request_size: usize,
    pub timestamp: String,
    pub api_endpoint: String,
}

impl std::fmt::Display for LlmErrorDetails {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} API {} ({}): {}",
               self.provider,
               self.error_type,
               self.status_code,
               self.raw_response.as_deref().unwrap_or("No details"))
    }
}

impl std::error::Error for LlmErrorDetails {}

// Route handlers for the provider-specific URLs (/api/gemini/analyze, /api/config/gemini, ...)
pub async fn analyze_gemini(
    data: web::Data<std::sync::Arc<ApiState>>,
    req: web::Json<LlmAnalysisRequest>,
) -> Result<HttpResponse> {
    analyze_with_provider(LlmProvider::Gemini, data, req).await
}

pub async fn test_gemini(data: web::Data<std::sync::Arc<ApiState>>) -> Result<HttpResponse> {
    test_provider_api(LlmProvider::Gemini, data).await
}

pub async fn test_openai(data: web::Data<std::sync::Arc<ApiState>>) -> Result<HttpResponse> {
    test_provider_api(LlmProvider::OpenAI, data).await
}

// Analyze data with the given provider's API key from the server .env
pub async fn analyze_with_provider(
    provider: LlmProvider,
    data: web::Data<std::sync::Arc<ApiState>>,
    req: web::Json<LlmAnalysisRequest>,
) -> Result<HttpResponse> {
    let Some(api_key) = provider.api_key(&data) else {
        return Ok(HttpResponse::BadRequest().json(LlmAnalysisResponse {
            success: false,
            analysis: None,
            error: Some(format!("{} API key not configured: set {} in the server .env", provider.name(), provider.env_var())),
            error_details: None,
            token_usage: None,
        }));
    };

    match call_provider_api(provider, &api_key, &req.prompt).await {
        Ok((analysis, token_usage)) => Ok(HttpResponse::Ok().json(LlmAnalysisResponse {
            success: true,
            analysis: Some(analysis),
            error: None,
            error_details: None,
            token_usage,
        })),
        Err(e) => {
            // Log detailed error for debugging
            eprintln!("{} API Error: {e:?}", provider.name());

            // Extract LlmErrorDetails if available
            let error_details = e.chain()
                .find_map(|err| err.downcast_ref::<LlmErrorDetails>())
                .cloned();

            Ok(HttpResponse::InternalServerError().json(LlmAnalysisResponse {
                success: false,
                analysis: None,
                error: Some(e.to_string()),
                error_details,
                token_usage: None,
            }))
        }
    }
}

// Call the provider's API for text generation
async fn call_provider_api(provider: LlmProvider, api_key: &str, prompt: &str) -> anyhow::Result<(String, Option<TokenUsage>)> {
    let client = reqwest::Client::new();
    let public_url = provider.public_url();
    let name = provider.name();
    let request_body = provider.request_body(prompt);

    let request_size = serde_json::to_string(&request_body)
        .map(|s| s.len())
        .unwrap_or(0);

    let start_time = std::time::Instant::now();

    println!("Making {name} API request - Size: {request_size} bytes, URL: {public_url}");

    let request = match provider {
        LlmProvider::Gemini => client.post(&public_url).query(&[("key", api_key)]),
        LlmProvider::OpenAI => client.post(&public_url).bearer_auth(api_key),
    };
    let response = request
        .header("Content-Type", "application/json")
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .with_context(|| format!("Failed to make request to {name} API"))?;

    let duration = start_time.elapsed();
    let status = response.status();
    let status_code = status.as_u16();

    println!("{name} API response - Status: {status}, Duration: {duration:?}");

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unable to read error response".to_string());

        let error_details = LlmErrorDetails {
            provider: name.to_string(),
            status_code,
            error_type: match status_code {
                400 => "Bad Request".to_string(),
                401 => "Unauthorized".to_string(),
                403 => "Forbidden".to_string(),
                429 => "Rate Limited".to_string(),
                500 => "Internal Server Error".to_string(),
                502 => "Bad Gateway".to_string(),
                503 => "Service Unavailable".to_string(),
                504 => "Gateway Timeout".to_string(),
                _ => "Unknown Error".to_string(),
            },
            raw_response: Some(error_text.clone()),
            request_size,
            timestamp: chrono::Utc::now().to_rfc3339(),
            api_endpoint: public_url.clone(),
        };

        println!("{name} API Error Details: {error_details:?}");

        return Err(anyhow::Error::new(error_details)
            .context(format!("{name} API error {status}: {error_text}")));
    }

    let response_json: Value = response.json().await
        .with_context(|| format!("Failed to parse {name} API response"))?;

    println!("{name} API response parsed successfully");

    // Extract the generated text from the response
    let text = provider.extract_text(&response_json)
        .ok_or_else(|| anyhow::anyhow!("Invalid {} API response format. Response: {}", name,
            serde_json::to_string_pretty(&response_json).unwrap_or_else(|_| "Unable to serialize response".to_string())))?;

    println!("{name} API text extracted successfully - Length: {} chars", text.len());

    // Extract token usage information
    let token_usage = provider.extract_usage(&response_json);

    if let Some(ref usage) = token_usage {
        println!("Token usage - Prompt: {:?}, Completion: {:?}, Total: {:?}",
                 usage.prompt_tokens, usage.completion_tokens, usage.total_tokens);
    }

    Ok((text.to_string(), token_usage))
}

// Test the provider's API key and connection
pub async fn test_provider_api(
    provider: LlmProvider,
    data: web::Data<std::sync::Arc<ApiState>>,
) -> Result<HttpResponse> {
    let name = provider.name();
    let Some(api_key) = provider.api_key(&data) else {
        return Ok(HttpResponse::Ok().json(LlmTestResponse {
            success: false,
            message: format!("{name} API key not configured"),
            api_key_present: false,
            api_key_preview: None,
            error: Some(format!("Please configure {} in your .env file", provider.env_var())),
        }));
    };

    // Create API key preview (first 4 + "..." + last 4 characters)
    let api_key_preview = if api_key.len() >= 8 {
        format!("{}...{}",
                &api_key[..4],
                &api_key[api_key.len()-4..])
    } else {
        "****".to_string()
    };

    // Test the API with a simple prompt
    match call_provider_api(provider, &api_key, "Hello, please respond with 'API test successful'").await {
        Ok((response, _)) => {
            if response.to_lowercase().contains("api test successful") {
                Ok(HttpResponse::Ok().json(LlmTestResponse {
                    success: true,
                    message: format!("{name} API connection successful"),
                    api_key_present: true,
                    api_key_preview: Some(api_key_preview),
                    error: None,
                }))
            } else {
                Ok(HttpResponse::Ok().json(LlmTestResponse {
                    success: true,
                    message: format!("{name} API responded but with unexpected content"),
                    api_key_present: true,
                    api_key_preview: Some(api_key_preview),
                    error: Some(format!("Expected test response, got: {}", response.chars().take(100).collect::<String>())),
                }))
            }
        },
        Err(e) => {
            Ok(HttpResponse::Ok().json(LlmTestResponse {
                success: false,
                message: format!("{name} API key present but API call failed"),
                api_key_present: true,
                api_key_preview: Some(api_key_preview),
                error: Some(e.to_string()),
            }))
        }
    }
}
