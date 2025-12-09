use actix_web::{web, HttpResponse, Responder, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

// Import existing LLM modules
use crate::claude_insights;
use crate::gemini_insights;
use crate::ApiState;

#[derive(Debug, Deserialize)]
pub struct UnifiedInsightsRequest {
    pub model: String,
    pub prompt: String,
    pub dataset_info: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct UnifiedInsightsResponse {
    pub success: bool,
    pub analysis: Option<String>,
    pub error: Option<String>,
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TokenUsage {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub total_tokens: usize,
}

/// Unified endpoint for all LLM insights
/// Routes requests to the appropriate LLM handler based on the model parameter
pub async fn analyze_with_llm(
    data: web::Data<Arc<ApiState>>,
    req: web::Json<UnifiedInsightsRequest>,
) -> Result<HttpResponse> {
    let model_id = req.model.to_lowercase();

    println!("Unified insights endpoint called with model: {}", model_id);

    match model_id.as_str() {
        "claude" => {
            // Create Claude request from unified request
            let claude_req = claude_insights::ClaudeAnalysisRequest {
                prompt: req.prompt.clone(),
                dataset_info: req.dataset_info.clone(),
            };

            // Route to existing Claude handler (doesn't need data/API key, uses CLI)
            claude_insights::analyze_with_claude_cli(web::Json(claude_req)).await
        }
        "gemini" => {
            println!("Processing Gemini request...");

            // Format prompt with dataset context for Gemini
            let formatted_prompt = format_prompt_with_dataset(&req.prompt, &req.dataset_info);
            println!("Formatted prompt length: {} chars", formatted_prompt.len());

            // Create Gemini request from unified request
            let gemini_req = gemini_insights::GeminiAnalysisRequest {
                prompt: formatted_prompt,
                data_context: None,
            };

            println!("Calling Gemini handler...");
            // Route to existing Gemini handler
            let response = gemini_insights::analyze_with_gemini(data, web::Json(gemini_req)).await;
            println!("Gemini handler returned, forwarding response");
            response
        }
        "openai" => {
            // OpenAI support - to be implemented
            Ok(HttpResponse::Ok().json(UnifiedInsightsResponse {
                success: false,
                analysis: None,
                error: Some("OpenAI integration coming soon. Please use Claude or Gemini for now.".to_string()),
                token_usage: None,
            }))
        }
        _ => {
            Ok(HttpResponse::BadRequest().json(UnifiedInsightsResponse {
                success: false,
                analysis: None,
                error: Some(format!("Unsupported model: {}. Supported models: claude, gemini, openai", model_id)),
                token_usage: None,
            }))
        }
    }
}

/// Format prompt with dataset context for LLMs that need it inline (like Gemini)
fn format_prompt_with_dataset(prompt: &str, dataset_info: &Option<Value>) -> String {
    if let Some(dataset) = dataset_info {
        // Extract key dataset information
        let record_count = dataset.get("record_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let filtered_count = dataset.get("filtered_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let sample_data = dataset.get("sample_data");
        let headers = dataset.get("headers").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(", "))
            .unwrap_or_default();

        let sort_info = dataset.get("sort_info");
        let filter_info = dataset.get("filter_info");

        format!(
            r#"{}

**Dataset Context:**
-- Original Total Records: {}
-- After Filters Applied: {}
-- Sample Size for Analysis: {}
-- All Available Headers: {}
-- Current Sort Order: {}
-- Active Filters: {}

**Sample Data (JSON format - filtered/sorted as displayed):**
{}"#,
            prompt,
            record_count,
            filtered_count,
            sample_data.as_ref().and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            headers,
            sort_info.and_then(|v| v.get("column"))
                .and_then(|v| v.as_str())
                .map(|col| {
                    let order = sort_info.and_then(|v| v.get("order"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    format!("{} ({})", col, order)
                })
                .unwrap_or_else(|| "Default order".to_string()),
            format_filter_info(filter_info),
            serde_json::to_string_pretty(&sample_data).unwrap_or_else(|_| "[]".to_string())
        )
    } else {
        prompt.to_string()
    }
}

/// Format filter information for display
fn format_filter_info(filter_info: Option<&Value>) -> String {
    if let Some(info) = filter_info {
        let mut filters = Vec::new();

        if let Some(status) = info.get("status_filter").and_then(|v| v.as_array()) {
            if !status.is_empty() {
                let status_str = status.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                filters.push(format!("Status: {}", status_str));
            }
        }

        if let Some(team) = info.get("team_filter").and_then(|v| v.as_str()) {
            if !team.is_empty() {
                filters.push(format!("Team: {}", team));
            }
        }

        if info.get("group_filter").and_then(|v| v.as_bool()).unwrap_or(false) {
            filters.push("Group participants only".to_string());
        }

        if filters.is_empty() {
            "None".to_string()
        } else {
            filters.join("; ")
        }
    } else {
        "None".to_string()
    }
}
