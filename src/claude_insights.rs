// src/claude_insights.rs
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use anyhow::Context;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

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
    req: web::Json<ClaudeAnalysisRequest>,
) -> Result<HttpResponse> {
    match call_claude_code_cli(&req.prompt, &req.dataset_info).await {
        Ok((analysis, token_usage)) => Ok(HttpResponse::Ok().json(ClaudeAnalysisResponse {
            success: true,
            analysis: Some(analysis),
            error: None,
            token_usage,
        })),
        Err(e) => {
            eprintln!("Claude Code CLI Error: {e:?}");
            
            // Provide estimated token usage even when Claude CLI fails
            let prompt_len = req.prompt.len();
            let estimated_prompt_tokens = (prompt_len / 4) as u32;
            let estimated_completion_tokens = 50; // Rough estimate for fallback message
            let estimated_total = estimated_prompt_tokens + estimated_completion_tokens;
            
            let fallback_token_usage = Some(TokenUsage {
                prompt_tokens: Some(estimated_prompt_tokens),
                completion_tokens: Some(estimated_completion_tokens),
                total_tokens: Some(estimated_total),
            });
            
            Ok(HttpResponse::InternalServerError().json(ClaudeAnalysisResponse {
                success: false,
                analysis: None,
                error: Some(format!("Claude Code CLI execution failed: {e}")),
                token_usage: fallback_token_usage,
            }))
        }
    }
}

// Call Claude Code CLI for dataset analysis
pub async fn call_claude_code_cli(prompt: &str, dataset_info: &Option<serde_json::Value>) -> anyhow::Result<(String, Option<TokenUsage>)> {
    use std::path::Path;
    use std::process::Command as StdCommand;

    // Find the Claude CLI executable from multiple possible locations
    let claude_paths = vec![
        // Environment variable override
        std::env::var("CLAUDE_CLI_PATH").ok(),
        // Common installation paths
        Some(format!("{}/.claude/local/claude", std::env::var("HOME").unwrap_or_default())),
        Some("/usr/local/bin/claude".to_string()),
        Some("/opt/homebrew/bin/claude".to_string()),
        // Try the PATH
        Some("claude".to_string()),
    ];

    // Find first existing Claude CLI path
    let claude_cmd = claude_paths
        .into_iter()
        .flatten()
        .find(|path| {
            if path == "claude" {
                // For "claude" in PATH, try to execute it
                StdCommand::new(path)
                    .arg("--version")
                    .output()
                    .map(|output| output.status.success())
                    .unwrap_or(false)
            } else {
                // For absolute paths, check if file exists and is executable
                Path::new(path).exists()
            }
        })
        .ok_or_else(|| anyhow::anyhow!(
            "Claude CLI not installed. To use this feature, install the Claude CLI or use the Gemini API instead. \
             You can set CLAUDE_CLI_PATH environment variable to specify the path."
        ))?;

    println!("Using Claude CLI at: {}", claude_cmd);

    // Build the full prompt with dataset context
    let full_prompt = if let Some(dataset) = dataset_info {
        format!("{}\n\nDataset Context:\n{}", prompt, serde_json::to_string_pretty(dataset)?)
    } else {
        prompt.to_string()
    };

    println!("Executing Claude Code CLI analysis...");

    let timeout_seconds = std::env::var("CLAUDE_CLI_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(90);

    // Run Claude in non-interactive text mode with tools disabled.
    // The insights prompt already includes the dataset context inline.
    let mut command = Command::new(&claude_cmd);
    command
        .arg("--print")
        .arg("--tools")
        .arg("")
        .arg(&full_prompt)
        .kill_on_drop(true);

    let output = timeout(Duration::from_secs(timeout_seconds), command.output())
        .await
        .map_err(|_| anyhow::anyhow!(
            "Claude Code CLI timed out after {} seconds. The CLI may be waiting on authentication, network access, or an internal startup step.",
            timeout_seconds
        ))?
        .context(format!(
            "Failed to execute claude command at {}. Make sure Claude Code CLI is installed and accessible.",
            claude_cmd
        ))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let exit_code = output.status.code().unwrap_or(-1);

        // Build detailed error message
        let mut error_msg = format!("Claude CLI exited with code {}", exit_code);
        if !stderr.is_empty() {
            error_msg.push_str(&format!(". Error: {}", stderr.trim()));
        }
        if !stdout.is_empty() {
            error_msg.push_str(&format!(". Output: {}", stdout.trim()));
        }

        return Err(anyhow::anyhow!("{}", error_msg));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let analysis = stdout.trim().to_string();

    if analysis.is_empty() {
        return Err(anyhow::anyhow!("Claude Code CLI returned empty response. This may indicate the CLI needs authentication or encountered an error."));
    }
    
    // Estimate token usage based on text length
    let prompt_len = full_prompt.len();
    let response_len = analysis.len();
    
    let estimated_prompt_tokens = (prompt_len / 4) as u32;  // Rough estimate: 4 chars per token
    let estimated_completion_tokens = (response_len / 4) as u32;
    let estimated_total = estimated_prompt_tokens + estimated_completion_tokens;
    
    let token_usage = Some(TokenUsage {
        prompt_tokens: Some(estimated_prompt_tokens),
        completion_tokens: Some(estimated_completion_tokens),
        total_tokens: Some(estimated_total),
    });
    
    println!("Claude Code CLI analysis completed successfully");
    Ok((analysis, token_usage))
}
