# Discord OAuth Setup Guide

This guide explains how to set up Discord OAuth authentication for the team platform.

## Discord Application Setup

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Enter your application name (e.g., "Team Platform")
4. Click "Create"

### 2. Configure OAuth2 Settings

1. In your Discord application, navigate to "OAuth2" → "General"
2. Add the following redirect URIs:
   - For development: `http://localhost:8081/api/auth/discord/callback`
   - For production: `https://yourdomain.com/api/auth/discord/callback`

### 3. Get Your Credentials

1. Copy your **Client ID** from the OAuth2 General page
2. Copy your **Client Secret** (click "Reset Secret" if needed)

### 4. Set Required Scopes

The Discord provider requests these scopes:
- `identify` - Access to basic user information (username, avatar, etc.)
- `email` - Access to user's email address

## Environment Configuration

Add the following variables to your `.env` file:

```env
# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
```

## OAuth Flow

### Authorization URL Structure
```
https://discord.com/api/oauth2/authorize?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code&scope=identify%20email
```

### Token Exchange
The application exchanges the authorization code for an access token using:
- **Token Endpoint**: `https://discord.com/api/oauth2/token`
- **Grant Type**: `authorization_code`

### User Information
User data is fetched from:
- **Userinfo Endpoint**: `https://discord.com/api/users/@me`

### Discord User Data Structure
```json
{
  "id": "123456789012345678",
  "username": "exampleuser",
  "email": "user@example.com",
  "avatar": "a_1234567890abcdef1234567890abcdef",
  "discriminator": "0001",
  "global_name": "Example User"
}
```

## Implementation Details

### Backend Configuration
Discord OAuth is configured in `config/oauth-providers.toml`:

```toml
[oauth.providers.discord]
name = "Discord"
client_id = "${DISCORD_CLIENT_ID}"
client_secret = "${DISCORD_CLIENT_SECRET}"
authorization_endpoint = "https://discord.com/api/oauth2/authorize"
token_endpoint = "https://discord.com/api/oauth2/token"
userinfo_endpoint = "https://discord.com/api/users/@me"
scopes = ["identify", "email"]
pkce_enabled = false
response_type = "code"
grant_type = "authorization_code"
```

### Frontend Integration
The Discord login button is automatically included in the auth modal:

```html
<button class="auth-btn" onclick="window.authModal.signInWith('discord')">
    <svg><!-- Discord logo --></svg>
    Continue with Discord
</button>
```

### User Data Processing
The `DiscordUserInfo` struct provides helper methods:
- `get_display_name()` - Returns global_name or username as fallback
- `get_avatar_url()` - Constructs the full avatar URL from the hash

## Security Considerations

1. **Client Secret**: Keep your Discord client secret secure and never expose it in frontend code
2. **HTTPS**: Use HTTPS in production for secure OAuth callbacks
3. **Redirect URI Validation**: Ensure redirect URIs are exact matches in Discord settings
4. **State Parameter**: The OAuth flow includes CSRF protection via state parameter

## Troubleshooting

### Common Issues

1. **Invalid Redirect URI**: Ensure the callback URL in Discord exactly matches your backend endpoint
2. **Scope Errors**: Verify that `identify` and `email` scopes are configured
3. **Client Secret**: Make sure environment variables are loaded correctly

### Testing

Test the Discord OAuth flow:
1. Click "Continue with Discord" in the auth modal
2. Authorize the application on Discord
3. Verify successful redirect to `?auth=success#account/preferences`

## Auth.js Integration

This implementation follows Auth.js (NextAuth.js) patterns for Discord OAuth:
- Standard OAuth 2.0 flow with authorization code grant
- No database storage required for user sessions
- Compatible with Auth.js Discord provider configuration
- Stateless authentication using JWT-like sessions

For more information, see [Auth.js Discord Provider Documentation](https://authjs.dev/reference/core/providers_discord).