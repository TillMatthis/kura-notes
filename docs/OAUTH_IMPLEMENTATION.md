# OAuth 2.0 Implementation for KURA Notes

This document describes the OAuth 2.0 authentication implementation for KURA Notes using KOauth as the authorization server.

## Overview

KURA Notes now supports proper OAuth 2.0 authorization code flow for browser-based authentication, while maintaining API key support for programmatic access (MCP servers, scripts).

## Authentication Methods

1. **OAuth 2.0 (Browser Users)** - Secure authorization code flow with automatic token refresh
2. **API Keys (Programmatic Access)** - Bearer tokens for MCP servers and scripts

## Environment Variables

Add these variables to your `.env` file:

```bash
# Required OAuth 2.0 Configuration
OAUTH_CLIENT_ID=kura-notes
OAUTH_CLIENT_SECRET=<your-client-secret>
OAUTH_REDIRECT_URI=https://kura.tillmaessen.de/oauth/callback

# Optional - Session Secret (uses COOKIE_SECRET if not set)
SESSION_SECRET=<your-session-secret>
```

### Getting OAuth Credentials

1. Register KURA Notes as an OAuth client with KOauth
2. Follow KOauth documentation: `docs/OAUTH_INTEGRATION.md`
3. Set the redirect URI to match your deployment URL
4. Save the client ID and secret in your `.env` file

## Implementation Details

### OAuth Flow

1. **User visits KURA Notes** → Redirected to `/auth/login`
2. **Initiate OAuth** → Redirected to KOauth with state parameter (CSRF protection)
3. **User authenticates on KOauth** → Approves consent screen (first time only)
4. **OAuth callback** → KOauth redirects back with authorization code
5. **Token exchange** → KURA Notes exchanges code for access & refresh tokens
6. **Session created** → Tokens stored in encrypted session cookie
7. **User logged in** → Access to KURA Notes dashboard

### Automatic Token Refresh

- Access tokens expire after a set time (configured in KOauth)
- KURA Notes automatically detects expired tokens
- Uses refresh token to obtain new access token
- User stays logged in without interruption
- If refresh fails, user is redirected to login

### Session Management

- Sessions stored in encrypted HTTP-only cookies
- 7-day session lifetime with rolling expiration
- CSRF protection using state parameter
- Secure in production (HTTPS only)

### API Key Authentication

API keys continue to work for programmatic access:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://kura.tillmaessen.de/api/capture
```

## File Changes

### New Files

- `src/api/routes/oauth.ts` - OAuth routes and token refresh logic
- `docs/OAUTH_IMPLEMENTATION.md` - This documentation

### Modified Files

- `src/config/config.ts` - Added OAuth configuration
- `src/api/middleware/auth.ts` - Updated for OAuth sessions and token refresh
- `src/api/server.ts` - Registered session plugin and OAuth routes
- `public/auth/login.html` - Updated to use OAuth flow
- `.env.example` - Added OAuth environment variables

## Routes

### OAuth Routes

- `GET /auth/login` - Initiates OAuth authorization flow
- `GET /oauth/callback` - Handles OAuth callback and token exchange
- `GET /auth/logout` - Logs out user and clears session

### Existing Routes (Unchanged)

- `GET /api/me` - Get current user profile
- `POST /api/logout` - Logout (now redirects to KOauth logout)
- All other API routes work with both OAuth and API key authentication

## Security Features

- ✅ CSRF protection with state parameter
- ✅ Encrypted session cookies (HTTP-only, secure in production)
- ✅ Automatic token refresh
- ✅ Graceful session expiration handling
- ✅ Bearer token validation for API keys
- ✅ Single sign-on support across apps

## Testing

### Manual Testing

1. Visit KURA Notes homepage
2. Click "Login with KOauth" button
3. Authenticate on KOauth (if not already logged in)
4. Approve consent screen (first time only)
5. Redirected back to KURA Notes dashboard
6. Verify you're logged in (user email in top navigation)
7. Test logout functionality

### API Testing

Test API key authentication still works:

```bash
# Get your API key from KOauth
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://kura.tillmaessen.de/api/me

# Should return user profile
```

## Troubleshooting

### Token Exchange Fails

- Verify `OAUTH_CLIENT_SECRET` is correct
- Check `OAUTH_REDIRECT_URI` matches registered callback URL
- Ensure KOauth server is accessible

### Session Not Persisting

- Check `SESSION_SECRET` or `COOKIE_SECRET` is set
- Verify cookies are enabled in browser
- Check `secure` cookie setting matches HTTPS usage

### Redirect Loop

- Clear browser cookies
- Verify OAuth routes are excluded from auth middleware
- Check session plugin is registered before auth middleware

## Success Criteria

- ✅ Browser users can login via OAuth
- ✅ Users stay logged in (session persists)
- ✅ Tokens refresh automatically
- ✅ MCP server still works with API keys (no breaking changes)
- ✅ Single sign-on works across apps
- ✅ Graceful session expiration handling
- ✅ Secure CSRF protection

## Migration Notes

### Backward Compatibility

The implementation maintains backward compatibility:

1. **Legacy sessions** - Old KOauth sessions still work
2. **API keys** - Unchanged, continue to work for programmatic access
3. **No breaking changes** - Existing integrations unaffected

### For Production Deployment

1. Set all required environment variables in `.env`
2. Register OAuth client with KOauth
3. Configure redirect URI for your domain
4. Set strong `SESSION_SECRET` (use `openssl rand -hex 64`)
5. Ensure `NODE_ENV=production` for secure cookies
6. Test login flow end-to-end
7. Verify API key authentication still works

## Additional Resources

- KOauth OAuth Integration: `docs/OAUTH_INTEGRATION.md` (in KOauth repository)
- OAuth 2.0 Specification: https://oauth.net/2/
- Fastify Session Plugin: https://github.com/fastify/session
