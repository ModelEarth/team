// OAuth Provider Configuration and Handler
// Supports Google, GitHub, LinkedIn, Microsoft, and Facebook OAuth2

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize, Clone)]
pub struct OAuthConfig {
    pub oauth: OAuthSettings,
}

#[derive(Debug, Deserialize, Clone)]
pub struct OAuthSettings {
    pub common: CommonOAuthSettings,
    pub providers: HashMap<String, OAuthProvider>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CommonOAuthSettings {
    pub default_redirect_uri: String,
    pub session_timeout_hours: u32,
    pub csrf_token_timeout_minutes: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct OAuthProvider {
    pub name: String,
    pub client_id: String,
    pub client_secret: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub userinfo_endpoint: String,
    pub issuer: Option<String>,
    pub scopes: Vec<String>,
    pub pkce_enabled: bool,
    pub response_type: String,
    pub grant_type: String,
    pub fields: Option<String>, // For Facebook
    pub demo_user: Option<DemoUser>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DemoUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

// OAuth URL response
#[derive(Debug, Serialize)]
pub struct OAuthUrlResponse {
    pub auth_url: String,
    pub state: String,
}

// User session info
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSession {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub provider: String,
    pub created_at: i64,
    pub expires_at: i64,
}

impl UserSession {
    pub fn is_expired(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        now > self.expires_at
    }

    pub fn new(user_id: String, email: String, name: String, picture: Option<String>, provider: String) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let expires_at = now + (24 * 60 * 60); // 24 hours from now
        
        Self {
            user_id,
            email,
            name,
            picture,
            provider,
            created_at: now,
            expires_at,
        }
    }
}

// Provider-specific user info structures
#[derive(Debug, Deserialize)]
pub struct GoogleUserInfo {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GitHubUserInfo {
    pub id: u64,
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkedInUserInfo {
    pub id: String,
    #[serde(rename = "localizedFirstName")]
    pub first_name: Option<String>,
    #[serde(rename = "localizedLastName")]
    pub last_name: Option<String>,
    #[serde(rename = "profilePicture")]
    pub profile_picture: Option<LinkedInPicture>,
}

#[derive(Debug, Deserialize)]
pub struct LinkedInPicture {
    #[serde(rename = "displayImage")]
    pub display_image: String,
}

#[derive(Debug, Deserialize)]
pub struct MicrosoftUserInfo {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "userPrincipalName")]
    pub email: String,
    pub mail: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FacebookUserInfo {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub picture: Option<FacebookPicture>,
}

#[derive(Debug, Deserialize)]
pub struct FacebookPicture {
    pub data: FacebookPictureData,
}

#[derive(Debug, Deserialize)]
pub struct FacebookPictureData {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct DiscordUserInfo {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub avatar: Option<String>,
    pub discriminator: String,
    pub global_name: Option<String>,
}

impl DiscordUserInfo {
    pub fn get_display_name(&self) -> String {
        self.global_name.clone()
            .unwrap_or_else(|| self.username.clone())
    }
    
    pub fn get_avatar_url(&self) -> Option<String> {
        self.avatar.as_ref().map(|avatar_hash| {
            format!("https://cdn.discordapp.com/avatars/{}/{}.png", self.id, avatar_hash)
        })
    }
}

impl OAuthConfig {
    pub fn load() -> anyhow::Result<Self> {
        // Load environment variables from .env file first
        dotenv::dotenv().ok();
        
        let config_path = "config/oauth-providers.toml";
        let config_content = std::fs::read_to_string(config_path)
            .with_context(|| format!("Failed to read OAuth config file: {}", config_path))?;
        
        // Substitute environment variables
        let env_vars = std::env::vars().collect();
        let expanded_content = envsubst::substitute(config_content, &env_vars)
            .map_err(|e| anyhow::anyhow!("Failed to substitute environment variables: {}", e))?;
        
        let config: OAuthConfig = toml::from_str(&expanded_content)
            .with_context(|| "Failed to parse OAuth configuration")?;
        
        Ok(config)
    }
    
    pub fn get_provider(&self, provider_name: &str) -> Option<&OAuthProvider> {
        self.oauth.providers.get(provider_name)
    }
    
    pub fn get_redirect_uri(&self, provider_name: &str) -> String {
        self.oauth.common.default_redirect_uri.replace("{provider}", provider_name)
    }
}

use anyhow::Context;