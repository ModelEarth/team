// src/claude_insights.rs
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use anyhow::Context;
use crate::ApiState;

#[derive(Debug, Deserialize)]
pub struct ClaudeAnalysisRequest {
    pub prompt: String,
    pub dataset_info: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ClaudeAnalysisResponse {
    pub success: bool,
    pub analysis: Option<String>,
    pub error: Option<String>,
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

pub async fn analyze_with_claude_cli(
    data: web::Data<std::sync::Arc<ApiState>>,
    req: web::Json<ClaudeAnalysisRequest>,
) -> Result<HttpResponse> {
    let api_key = {
        let config = data.config.lock().unwrap();
        config.anthropic_api_key.clone()
    };

    if api_key.is_empty() {
        return Ok(HttpResponse::BadRequest().json(ClaudeAnalysisResponse {
            success: false,
            analysis: None,
            error: Some("Anthropic API key not configured. Set ANTHROPIC_API_KEY in your .env file.".to_string()),
            token_usage: None,
        }));
    }

    match call_claude_api(&api_key, &req.prompt, &req.dataset_info).await {
        Ok((analysis, token_usage)) => Ok(HttpResponse::Ok().json(ClaudeAnalysisResponse {
            success: true,
            analysis: Some(analysis),
            error: None,
            token_usage,
        })),
        Err(e) => {
            eprintln!("Claude API Error: {e:?}");
            Ok(HttpResponse::InternalServerError().json(ClaudeAnalysisResponse {
                success: false,
                analysis: None,
                error: Some(format!("Claude API request failed: {e}")),
                token_usage: None,
            }))
        }
    }
}

pub async fn call_claude_api(
    api_key: &str,
    prompt: &str,
    dataset_info: &Option<serde_json::Value>,
) -> anyhow::Result<(String, Option<TokenUsage>)> {
    let full_prompt = if let Some(dataset) = dataset_info {
        format!("{}\n\nDataset Context:\n{}", prompt, serde_json::to_string_pretty(dataset)?)
    } else {
        prompt.to_string()
    };

    let client = reqwest::Client::new();
    let request_body = json!({
        "model": "claude-sonnet-4-6",
        "max_tokens": 8192,
        "messages": [{"role": "user", "content": full_prompt}]
    });

    println!("Making Anthropic API request...");

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .context("Failed to connect to Anthropic API")?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unable to read error response".to_string());
        return Err(anyhow::anyhow!("Anthropic API error {}: {}", status, error_text));
    }

    let response_json: serde_json::Value = response.json().await
        .context("Failed to parse Anthropic API response")?;

    let text = response_json
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|b| b.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| anyhow::anyhow!("Unexpected Anthropic API response format: {}",
            serde_json::to_string_pretty(&response_json).unwrap_or_default()))?;

    let token_usage = response_json.get("usage").map(|u| TokenUsage {
        prompt_tokens: u.get("input_tokens").and_then(|v| v.as_u64()).map(|v| v as u32),
        completion_tokens: u.get("output_tokens").and_then(|v| v.as_u64()).map(|v| v as u32),
        total_tokens: {
            let i = u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let o = u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            Some((i + o) as u32)
        },
    });

    println!("Claude API analysis completed successfully");
    Ok((text.to_string(), token_usage))
}
