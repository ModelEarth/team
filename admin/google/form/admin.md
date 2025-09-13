# Admin Info

## How Auth.js Works

**Safe Flow:**
1. User authenticates with Google, Microsoft, etc. via Auth.js
2. Auth.js creates a **server-side session** (stored securely with signed cookies/JWTs)
3. Your API endpoints validate the session **on the server** using `getServerSession()`
4. The user's email comes from the **validated server session**, not client JavaScript

**Client-side JavaScript never sends the email directly to your API.**

## What Prevents Impersonation

**Server-Side Session Validation:**
```javascript
// pages/api/sheets/update.js - This runs on YOUR server
export default async function handler(req, res) {
  // This validates the session server-side against your session store
  const session = await getServerSession(req, res, authOptions)
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // This email comes from YOUR validated session, not client input
  const trustedEmail = session.user.email
  
  // Client can't fake this - it's from your session validation
}
```

**What a Hacker CAN'T Do:**
- Modify client JavaScript to send a fake email
- Forge session cookies (they're cryptographically signed)
- Bypass Microsoft's OAuth flow
- Access another user's server-side session

**What a Hacker COULD Try (and why it fails):**
- **Modify client code:** Irrelevant - email comes from server session
- **Send fake requests:** Session validation will fail
- **Steal session cookies:** Possible, but requires XSS or other attacks (mitigated by proper security headers)

## Additional Security Layers

**CSRF Protection:**
```javascript
// Auth.js includes CSRF protection by default
export default NextAuth({
  // ... your config
  // CSRF tokens are automatically handled
})
```

**Secure Cookie Settings:**
```javascript
export default NextAuth({
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,    // Not accessible via JavaScript
        sameSite: 'lax',   // CSRF protection
        secure: true,      // HTTPS only
      }
    }
  }
})
```

## Best Practices for Extra Security

**Rate Limiting:**
```javascript
// Prevent abuse even with valid sessions
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each user to 100 requests per windowMs
})
```

**Input Validation:**
```javascript
// Validate all inputs, even though email is trusted
const { rowData, rowIndex } = req.body
if (!isValidRowData(rowData) || !isValidRowIndex(rowIndex)) {
  return res.status(400).json({ error: 'Invalid input' })
}
```

The core principle: **never trust client-side data for authentication/authorization**
Always validate sessions server-side. Auth.js handles this by design.