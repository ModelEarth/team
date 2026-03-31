# Getting a Google OAuth Client ID

## 1. Open Google Cloud Console

Go to <a href="https://console.cloud.google.com" target="_blank">console.cloud.google.com</a> and sign in with the Google account that owns your project. <span class="local" style="display:none">MemberSense</span>

## 2. Create or Select a Project

Click the project dropdown at the top of the page. Either select an existing project or click **New Project**, give it a name, and click **Create**.

## 3. Enable the Google Sheets API

Go to **APIs & Services > Library**, search for **Google Sheets API**, and enable it. Then continue to the "Create credentials" step and choose "User data". No other API is needed for Google Sign-In itself.

## 4. Set Scopes

Click **Add or Remove Scopes** and check these three:

- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `openid`

## 5. Create OAuth Credentials

Choose **OAuth client ID**.

- **Application type:** Web application
- **Name:** anything descriptive (e.g. "Member Form")

Or go to **APIs & Services > Credentials**, click **+ Create Credentials**, and choose **OAuth client ID**.

## 6. Configure the OAuth Consent Screen

Go to **APIs & Services > OAuth consent screen**.

- Choose **External** (unless restricted to your organization).
- Fill in the app name, support email, and developer contact email.
- Click **Save and Continue** through the scopes and test users steps.

## 7. Add Authorized JavaScript Origins

Under **Authorized JavaScript origins**, add:

```
http://localhost
http://localhost:8887
https://your-production-domain.com
```

No redirect URIs are needed for the Google Identity Services (GSI) sign-in button.

## 8. Copy Your Client ID

Click **Create**. A dialog shows your **Client ID** (ending in `.apps.googleusercontent.com`). Copy it.

## 9. Add It to Your Config

Paste the Client ID into `team/admin/google/form/config.yaml`:

```yaml
OAuth:
  clientId: YOUR_CLIENT_ID.apps.googleusercontent.com
```

Or set it in `docker/.env`:

```
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

Then reload this page.
