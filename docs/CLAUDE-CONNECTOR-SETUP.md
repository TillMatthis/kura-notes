# Claude Custom Connector Setup Guide

This guide walks you through setting up KURA Notes MCP server as a Claude Custom Connector with OAuth authentication.

## Overview

Claude Custom Connectors allow Claude (web and desktop) to connect to remote MCP servers using OAuth 2.0 authentication. This guide covers:

1. Registering an OAuth client in KOauth
2. Configuring the MCP server
3. Connecting Claude to the MCP server
4. Troubleshooting common issues

## Prerequisites

- KURA Notes MCP server running and accessible via HTTPS
- Access to KOauth dashboard at `https://auth.tillmaessen.de/dashboard`
- Claude account (Pro, Max, Enterprise, or Team plan)

## Step 1: Register OAuth Client in KOauth

### 1.1 Access KOauth Dashboard

1. Navigate to `https://auth.tillmaessen.de/dashboard`
2. Log in with your Google/GitHub account or email/password

### 1.2 Create OAuth Client

1. Navigate to **OAuth Clients** section in the dashboard
2. Click **New Client** or **Create OAuth Client**
3. Fill in the client details:

   **Client Name:** `Claude Custom Connector` (or any descriptive name)

   **Client ID:** `claude-mcp` (or let KOauth generate one)

   **Client Secret:** (KOauth will generate this - save it securely!)

   **Client Type:** `Public` or `Confidential` (both work, Confidential is more secure)

### 1.3 Configure Redirect URIs

**Critical:** You must register ALL redirect URIs that Claude might use. Add these exact URIs:

#### For Claude Web App:
```
https://claude.ai/api/mcp/auth_callback
```

#### For Claude Desktop App:
```
http://127.0.0.1:6277/callback
http://127.0.0.1:6278/callback
http://127.0.0.1:6279/callback
```

**Important Notes:**
- Redirect URIs must match **exactly** (including protocol, domain, path, trailing slashes)
- Claude Desktop uses localhost ports 6277-6279 for OAuth callbacks
- Register all URIs even if you only plan to use one platform
- Some versions of Claude may use `https://claude.com/api/mcp/auth_callback` - add this too if needed

### 1.4 Configure Scopes

Ensure these scopes are available and enabled:
- `openid` (required)
- `profile` (required)
- `email` (required)

### 1.5 Save Client Credentials

After creating the client:
1. **Copy the Client ID** - you'll need this for Claude configuration
2. **Copy the Client Secret** - you'll need this for Claude configuration
3. **Save both securely** - you won't be able to see the secret again!

## Step 2: Verify MCP Server Configuration

### 2.1 Check Environment Variables

Ensure your `.env` file has:

```bash
# KOauth Configuration
KOAUTH_URL=https://auth.tillmaessen.de
KOAUTH_TIMEOUT=5000

# MCP Server Configuration
MCP_PORT=3001
MCP_BASE_URL=https://kura.tillmaessen.de/mcp  # Important for discovery endpoint
```

### 2.2 Test Discovery Endpoint

Run the debug script to verify everything is working:

```bash
cd mcp
./debug-oauth.sh
```

Or test manually:

```bash
# Test discovery endpoint
curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource

# Expected response:
# {
#   "resource": "https://kura.tillmaessen.de/mcp/sse",
#   "authorization_servers": ["https://auth.tillmaessen.de"],
#   "jwks_uri": "https://auth.tillmaessen.de/.well-known/jwks.json",
#   "scopes_supported": ["openid", "profile", "email"],
#   "bearer_methods_supported": ["header"]
# }
```

### 2.3 Verify KOauth Authorization Server Metadata

Test that KOauth provides RFC 8414 metadata:

```bash
curl https://auth.tillmaessen.de/.well-known/oauth-authorization-server

# Expected response includes:
# {
#   "issuer": "https://auth.tillmaessen.de",
#   "authorization_endpoint": "https://auth.tillmaessen.de/oauth/authorize",
#   "token_endpoint": "https://auth.tillmaessen.de/oauth/token",
#   "jwks_uri": "https://auth.tillmaessen.de/.well-known/jwks.json",
#   "scopes_supported": ["openid", "profile", "email"],
#   "response_types_supported": ["code"],
#   "code_challenge_methods_supported": ["S256"]
# }
```

## Step 3: Configure Claude Web App

### 3.1 Access Claude Settings

1. Log in to Claude at `https://claude.ai`
2. Click your profile icon (top right)
3. Go to **Settings** → **Connectors**

### 3.2 Add Custom Connector

1. Click **Add custom connector** or **+ New Connector**
2. Fill in the connector details:

   **Server Name:** `KURA Notes` (or any name you prefer)

   **Server URL:** `https://kura.tillmaessen.de/mcp/sse`

   **Authentication:** Select **OAuth 2.0**

   **OAuth Client ID:** Enter the Client ID from Step 1.5

   **OAuth Client Secret:** Enter the Client Secret from Step 1.5

3. Click **Add** or **Save**

### 3.3 Connect the Connector

1. Find your connector in the list
2. Click **Connect** or toggle it on
3. You'll be redirected to KOauth for authentication
4. Log in with your Google/GitHub account or email/password
5. Approve the authorization request
6. You'll be redirected back to Claude
7. The connector should now show as **Connected**

## Step 4: Configure Claude Desktop App

### 4.1 Access Claude Desktop Settings

1. Open Claude Desktop application
2. Go to **Settings** → **Connectors** (or **Preferences** → **Connectors`)

### 4.2 Add Custom Connector

1. Click **Add Custom Connector** or **+ New**
2. Fill in the connector details:

   **Server Name:** `KURA Notes`

   **Server URL:** `https://kura.tillmaessen.de/mcp/sse`

   **Authentication:** Select **OAuth 2.0**

   **OAuth Client ID:** Enter the Client ID from Step 1.5

   **OAuth Client Secret:** Enter the Client Secret from Step 1.5

3. Click **Add** or **Save**

### 4.3 Connect the Connector

1. Find your connector in the list
2. Click **Connect**
3. Your browser will open for OAuth authentication
4. Log in with your KOauth credentials
5. Approve the authorization request
6. Return to Claude Desktop
7. The connector should now show as **Connected**

## Step 5: Test the Connection

Once connected, test that Claude can access your notes:

**Try these commands in Claude:**

```
Search my KURA notes for "machine learning"
```

```
Create a note in KURA with title "Test" and content "This is a test note"
```

```
Show me my recent notes from KURA
```

## Troubleshooting

### Issue: "Connect" button doesn't work

**Symptoms:** Clicking "Connect" doesn't initiate OAuth flow

**Possible Causes:**
1. Discovery endpoint not accessible
2. OAuth client not configured correctly
3. Redirect URI mismatch

**Solutions:**
1. Test discovery endpoint: `curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource`
2. Verify OAuth client exists in KOauth dashboard
3. Check that redirect URIs match exactly (see Step 1.3)
4. Check MCP server logs: `docker logs kura-notes-mcp`

### Issue: OAuth redirect fails

**Symptoms:** After logging in, redirect fails or shows error

**Possible Causes:**
1. Redirect URI not registered in KOauth
2. Redirect URI mismatch (even small differences matter)
3. OAuth client disabled or deleted

**Solutions:**
1. Verify redirect URI in KOauth matches exactly what Claude uses
2. Check browser network tab to see what redirect URI Claude actually uses
3. Register all possible redirect URIs (see Step 1.3)
4. Verify OAuth client is active in KOauth dashboard

### Issue: "Invalid client" error

**Symptoms:** OAuth flow fails with "invalid_client" error

**Possible Causes:**
1. Client ID incorrect
2. Client Secret incorrect
3. OAuth client deleted or disabled

**Solutions:**
1. Verify Client ID matches exactly (case-sensitive)
2. Verify Client Secret matches exactly (case-sensitive)
3. Check OAuth client exists and is active in KOauth dashboard
4. Create new OAuth client if needed

### Issue: Discovery endpoint returns 404

**Symptoms:** `/.well-known/oauth-protected-resource` returns 404

**Possible Causes:**
1. MCP server not running
2. Reverse proxy not routing correctly
3. Wrong base URL

**Solutions:**
1. Check MCP server is running: `docker ps | grep mcp`
2. Verify reverse proxy routes `/mcp*` to port 3001
3. Set `MCP_BASE_URL` in `.env` file
4. Restart MCP server: `docker-compose restart mcp`
5. Test locally: `curl http://localhost:3001/.well-known/oauth-protected-resource`

### Issue: CORS errors in browser console

**Symptoms:** Browser console shows CORS errors when connecting

**Possible Causes:**
1. CORS headers not set correctly
2. Preflight OPTIONS request failing

**Solutions:**
1. Verify CORS headers are set (should be automatic in latest version)
2. Check MCP server logs for OPTIONS requests
3. Ensure reverse proxy doesn't strip CORS headers
4. Test CORS: `curl -H "Origin: https://claude.ai" -I https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource`

### Issue: Token validation fails

**Symptoms:** Connection succeeds but requests fail with 401

**Possible Causes:**
1. Token format incorrect
2. JWKS endpoint not accessible
3. Token expired

**Solutions:**
1. Check MCP server logs for token validation errors
2. Verify JWKS endpoint: `curl https://auth.tillmaessen.de/.well-known/jwks.json`
3. Check token expiration time
4. Try reconnecting to get a fresh token

## Debugging Tools

### Debug Script

Run the comprehensive debug script:

```bash
cd mcp
./debug-oauth.sh
```

This tests:
- Health endpoint
- OAuth discovery endpoint (RFC 9728)
- SSE endpoint authentication
- KOauth authorization server metadata (RFC 8414)
- CORS headers
- OAuth URL format

### Manual Testing

Test each component individually:

```bash
# 1. Test discovery endpoint
curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource

# 2. Test SSE endpoint (should return 401)
curl -v https://kura.tillmaessen.de/mcp/sse

# 3. Test KOauth metadata
curl https://auth.tillmaessen.de/.well-known/oauth-authorization-server

# 4. Test CORS
curl -H "Origin: https://claude.ai" -I https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
```

### MCP Inspector

Use the MCP Inspector to test the full OAuth flow:

```bash
npx @modelcontextprotocol/inspector
```

1. Select transport: **SSE** or **Streamable HTTP**
2. Enter server URL: `https://kura.tillmaessen.de/mcp/sse`
3. Click **Open Auth Settings**
4. Follow **Quick OAuth Flow**
5. Copy the `access_token` for testing

### Check Logs

```bash
# MCP server logs
docker logs kura-notes-mcp --tail 100 -f

# Look for:
# - OAuth discovery requests
# - Authentication attempts
# - Token validation errors
# - Connection attempts
```

## Security Considerations

1. **Client Secret:** Keep your OAuth client secret secure. Never commit it to version control.

2. **Redirect URIs:** Only register redirect URIs you trust. Don't use wildcards unless necessary.

3. **HTTPS:** Always use HTTPS for OAuth flows. Never use HTTP in production.

4. **Token Storage:** Claude handles token storage securely. Don't manually store tokens.

5. **Scopes:** Only request the minimum scopes needed (`openid profile email`).

6. **Regular Audits:** Periodically review connected connectors and revoke unused ones.

## Additional Resources

- [MCP Specification](https://modelcontextprotocol.io/specification/draft)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)
- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414)
- [Claude Custom Connectors Documentation](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [KURA Notes MCP Setup Guide](../MCP-SETUP-GUIDE.md)

## Support

If you encounter issues not covered in this guide:

1. Check the [DEBUG-CLAUDE-CONNECTOR.md](../DEBUG-CLAUDE-CONNECTOR.md) guide
2. Review MCP server logs: `docker logs kura-notes-mcp`
3. Run the debug script: `./mcp/debug-oauth.sh`
4. Check KOauth dashboard for OAuth client status

---

**Last Updated:** 2025-01-15  
**Status:** ✅ Production Ready
