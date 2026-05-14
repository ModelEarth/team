[BetterAuth](#betterauth) | [Microsoft Auth](#microsoft-auth) | [Old Next.js](#old-nextjs)

---

<span id="betterauth"></span>

# BetterAuth with Google Settings

TO DO: delete the betterauth submodule

BetterAuth provides authentication from the Earthscape "[chat](../../../../chat/)" submodule using port 8888 to handle OAuth sign-in, eventually via Google, GitHub, LinkedIn, Microsoft, Discord, and Facebook using a server-side callback flow.

## How It Differs from the Google Sign-In Button

Both use **Google Identity Services (GSI)** (see "Getting a Google OAuth Client ID") via the same OAuth Client ID, but the have different settings in Google Cloud Console:

**BetterAuth**
- Flow: Server-side redirect
- Google Console setting: Authorized redirect URIs
- Redirect URI needed: Yes

**GSI Sign-In Button (not using here)**
- Flow: Popup / one-tap
- Google Console setting: Authorized JavaScript origins
- Redirect URI needed: No


## Adding the Google Redirect URI for BetterAuth

For BetterAuth, register the redirect URI sent by BetterAuth in your Google OAuth client.  
Doing so prevents the "redirect_uri_mismatch" error when your site user attempts to sign in.

In [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials), open your OAuth client and add to **Authorized redirect URIs**:

```
http://localhost:3002/api/auth/callback/google
```

For production, also add:

```
https://your-domain.com/api/auth/callback/google
```

See Google's documentation on [redirect_uri_mismatch errors](https://developers.google.com/identity/protocols/oauth2/web-server#authorization-errors-redirect-uri-mismatch) for more detail.

## Environment Variables

Set these in `docker/.env`:

```
BETTER_AUTH_SECRET=   # any random 32+ char string (openssl rand -base64 32)
BASE_URL=http://localhost:3002
ALLOWED_ORIGINS=http://localhost:8887,http://localhost:8888
GOOGLE_CLIENT_ID=     # same client ID used for the GSI button
GOOGLE_CLIENT_SECRET= # from Google Cloud Console
```

Then restart the BetterAuth server (`better-auth/src/index.js`).

---

<div id="microsoft-auth" style="margin-top:40px"></div>

# Microsoft Auth

**Microsoft OAuth is supported directly through BetterAuth** — no separate library needed. BetterAuth includes Microsoft as a built-in provider alongside Google, GitHub, LinkedIn, and others. The callback URL to register in Azure is `http://localhost:3002/api/auth/callback/microsoft`.

To enable it, add to `docker/.env`:

```
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
```

Then register the redirect URI in [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → your app → Authentication → Redirect URIs:

```
http://localhost:3002/api/auth/callback/microsoft
```

---

<div id="old-nextjs" style="margin-top:40px"></div>

# Old Next.js

Auth.js (formerly NextAuth.js) is an alternative for Next.js frontends that need Microsoft Entra ID authentication with row-level access control on Google Sheets.

## Auth.js Configuration

```javascript
// pages/api/auth/[...nextauth].js
import { MicrosoftEntraID } from "@auth/microsoft-entra-id"

export default NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID, // optional
    })
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.verifiedEmail = session.user.email
      return session
    }
  }
})
```

## Row-Level Access Control via Google Sheets API

```javascript
// pages/api/sheets/update.js
import { getServerSession } from "next-auth"
import { google } from 'googleapis'

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const userEmail = session.user.email
  const sheets = google.sheets({ version: 'v4', auth: serviceAccountAuth })
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: 'your-sheet-id',
    range: 'Sheet1!A:Z',
  })
  const userRows = response.data.values.filter(row => row[0] === userEmail)
  // Allow updates only to user's rows
}
```

## Google Sheets API Setup

You'll still need a Google Cloud Project with Sheets API enabled, Service Account credentials, and the sheet shared with your service account email.
