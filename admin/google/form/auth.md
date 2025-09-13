# Auth.js Config

You can use Microsoft Outlook/Azure AD authentication with Google Sheets API and implement row-level access control based on authenticated email addresses. Auth.js (formerly NextAuth.js) is perfect for this scenario.

## Architecture Overview

**Authentication Flow:**
1. User logs in via Microsoft OAuth through Auth.js
2. Auth.js validates the user and provides their verified email address
3. Your application uses this email to determine which rows they can edit
4. Google Sheets API handles the actual data operations

## Implementation with Auth.js

**Auth.js Configuration:**
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
      // Email is now verified by Microsoft
      session.user.verifiedEmail = session.user.email
      return session
    }
  }
})
```

## Row-Level Access Control Logic

**Backend API Route:**
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
  
  // Get all rows and filter by user email
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: 'your-sheet-id',
    range: 'Sheet1!A:Z',
  })
  
  const rows = response.data.values
  const userRows = rows.filter((row, index) => {
    // Assuming email is in column A (index 0)
    return row[0] === userEmail
  })
  
  // Allow updates only to user's rows
  // Implement your update logic here
}
```

## Security Benefits

**Email Verification:** Microsoft OAuth provides verified email addresses, so you can trust the authentication
**No Direct Sheet Access:** Users never directly access the Google Sheet - they go through your controlled API
**Audit Trail:** You can log all changes with authenticated user information
**Flexible Permissions:** You can implement complex business logic beyond just email matching

## Google Sheets API Setup

You'll still need:
- A Google Cloud Project with Sheets API enabled
- Service Account credentials for your backend to access the sheet
- The sheet shared with your service account email

## Alternative Row Identification Strategies

Beyond just email matching, you could:
- Use employee IDs that map to Microsoft emails
- Support multiple email domains/formats
- Implement team-based permissions
- Add role-based access control

This approach gives you the best of both worlds: Microsoft's enterprise-grade authentication with Google Sheets' collaborative features, all while maintaining strict row-level security. The user experience is seamless - they log in with their work account and can only see/edit their own data.

Would you like me to elaborate on any specific part of this implementation?