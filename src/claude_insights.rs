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
    /// "cli" runs the local Claude Code CLI (subscription login); otherwise ANTHROPIC_API_KEY is used
    #[serde(default)]
    pub key_source: Option<String>,
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
    if req.key_source.as_deref() == Some("cli") {
        return match call_claude_code_cli(&req.prompt, &req.dataset_info).await {
            Ok((analysis, token_usage)) => Ok(HttpResponse::Ok().json(ClaudeAnalysisResponse {
                success: true,
                analysis: Some(analysis),
                error: None,
                token_usage,
            })),
            Err(e) => {
                eprintln!("Claude Code CLI Error: {e:?}");
                Ok(HttpResponse::InternalServerError().json(ClaudeAnalysisResponse {
                    success: false,
                    analysis: None,
                    error: Some(format!("Claude Code CLI request failed: {e}")),
                    token_usage: None,
                }))
            }
        };
    }

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

fn build_full_prompt(prompt: &str, dataset_info: &Option<serde_json::Value>) -> anyhow::Result<String> {
    Ok(if let Some(dataset) = dataset_info {
        format!("{}\n\nDataset Context:\n{}", prompt, serde_json::to_string_pretty(dataset)?)
    } else {
        prompt.to_string()
    })
}

/// Runs the prompt through the locally installed Claude Code CLI (`claude -p`),
/// which bills against the Claude subscription the CLI is logged into rather than API credits.
pub async fn call_claude_code_cli(
    prompt: &str,
    dataset_info: &Option<serde_json::Value>,
) -> anyhow::Result<(String, Option<TokenUsage>)> {
    use tokio::io::AsyncWriteExt;
    use tokio::process::Command;

    let full_prompt = build_full_prompt(prompt, dataset_info)?;

    println!("Making Claude Code CLI request...");

    // ANTHROPIC_API_KEY (loaded from .env) would make the CLI bill the API account,
    // so remove it to use the CLI's own subscription login.
    // Run from the temp dir so project CLAUDE.md/AGENTS.md files aren't pulled into context.
    let mut child = Command::new("claude")
        .arg("-p")
        .arg("--output-format")
        .arg("json")
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        .current_dir(std::env::temp_dir())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("Failed to run the claude command. Make sure Claude Code CLI is installed and on the PATH of the Rust server.")?;

    // Send the prompt on stdin since dataset context can exceed argument length limits
    let mut stdin = child.stdin.take().context("Failed to open claude stdin")?;
    stdin.write_all(full_prompt.as_bytes()).await.context("Failed to write prompt to claude")?;
    drop(stdin);

    let output = tokio::time::timeout(std::time::Duration::from_secs(300), child.wait_with_output())
        .await
        .map_err(|_| anyhow::anyhow!("Claude Code CLI timed out after 300 seconds"))?
        .context("Failed to read claude output")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response_json: serde_json::Value = match serde_json::from_str(stdout.trim()) {
        Ok(v) => v,
        Err(_) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Claude Code CLI exited with {}: {} {}",
                output.status, stderr.trim(), stdout.trim()));
        }
    };

    let text = response_json.get("result").and_then(|t| t.as_str()).unwrap_or_default();
    if !output.status.success() || response_json.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Err(anyhow::anyhow!("Claude Code CLI error: {}",
            if text.is_empty() { stdout.trim() } else { text }));
    }

    let token_usage = response_json.get("usage").map(|u| {
        let input = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
            .iter()
            .filter_map(|k| u.get(*k).and_then(|v| v.as_u64()))
            .sum::<u64>();
        let output_tokens = u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        TokenUsage {
            prompt_tokens: Some(input as u32),
            completion_tokens: Some(output_tokens as u32),
            total_tokens: Some((input + output_tokens) as u32),
        }
    });

    println!("Claude Code CLI analysis completed successfully");
    Ok((text.to_string(), token_usage))
}

pub async fn call_claude_api(
    api_key: &str,
    prompt: &str,
    dataset_info: &Option<serde_json::Value>,
) -> anyhow::Result<(String, Option<TokenUsage>)> {
    let full_prompt = build_full_prompt(prompt, dataset_info)?;

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
