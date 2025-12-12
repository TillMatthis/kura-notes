# Claude Custom Connector Testing Checklist

This checklist helps you verify that your KURA Notes MCP server is properly configured for Claude Custom Connector integration.

## Pre-Testing Prerequisites

- [ ] MCP server is running and accessible
- [ ] KOauth is running and accessible
- [ ] OAuth client is registered in KOauth
- [ ] Environment variables are configured correctly
- [ ] Reverse proxy (Caddy) is configured correctly

## Phase 1: Infrastructure Testing

### 1.1 MCP Server Health

```bash
curl https://kura.tillmaessen.de/mcp/health
```

**Expected:** HTTP 200 with JSON response
```json
{
  "status": "ok",
  "service": "kura-mcp-server",
  "version": "0.1.0",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

- [ ] Health endpoint returns 200
- [ ] Response contains expected fields
- [ ] Service name is correct

### 1.2 OAuth Discovery Endpoint (RFC 9728)

```bash
curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
```

**Expected:** HTTP 200 with RFC 9728 compliant JSON
```json
{
  "resource": "https://kura.tillmaessen.de/mcp/sse",
  "authorization_servers": ["https://auth.tillmaessen.de"],
  "jwks_uri": "https://auth.tillmaessen.de/.well-known/jwks.json",
  "scopes_supported": ["openid", "profile", "email"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://kura.tillmaessen.de/api/docs"
}
```

- [ ] Endpoint returns 200
- [ ] `resource` field is present and absolute URL
- [ ] `authorization_servers` array contains KOauth URL
- [ ] `scopes_supported` includes required scopes
- [ ] `bearer_methods_supported` includes "header"
- [ ] Response is valid JSON

### 1.3 SSE Endpoint Authentication

```bash
curl -v https://kura.tillmaessen.de/mcp/sse
```

**Expected:** HTTP 401 with WWW-Authenticate header
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource"
```

- [ ] Returns 401 (not 200, 404, or 500)
- [ ] WWW-Authenticate header is present
- [ ] Header points to discovery endpoint
- [ ] Response body indicates authentication required

### 1.4 KOauth Authorization Server Metadata (RFC 8414)

```bash
curl https://auth.tillmaessen.de/.well-known/oauth-authorization-server
```

**Expected:** HTTP 200 with RFC 8414 compliant JSON
```json
{
  "issuer": "https://auth.tillmaessen.de",
  "authorization_endpoint": "https://auth.tillmaessen.de/oauth/authorize",
  "token_endpoint": "https://auth.tillmaessen.de/oauth/token",
  "jwks_uri": "https://auth.tillmaessen.de/.well-known/jwks.json",
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"]
}
```

- [ ] Endpoint returns 200
- [ ] `issuer` field matches KOauth URL
- [ ] `authorization_endpoint` is present
- [ ] `token_endpoint` is present
- [ ] `jwks_uri` is present
- [ ] `code_challenge_methods_supported` includes "S256" (PKCE)

### 1.5 CORS Headers

```bash
curl -H "Origin: https://claude.ai" -I https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
```

**Expected:** CORS headers present
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

- [ ] CORS headers are present
- [ ] Origin is allowed (or * is used)
- [ ] Methods include GET and OPTIONS
- [ ] Headers include Authorization

### 1.6 CORS Preflight (OPTIONS)

```bash
curl -X OPTIONS -H "Origin: https://claude.ai" -H "Access-Control-Request-Method: GET" -I https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
```

**Expected:** HTTP 204 with CORS headers

- [ ] Returns 204 (No Content)
- [ ] CORS headers are present
- [ ] Preflight succeeds

## Phase 2: OAuth Client Configuration

### 2.1 OAuth Client Exists

- [ ] OAuth client exists in KOauth dashboard
- [ ] Client ID is known and accessible
- [ ] Client Secret is known and accessible
- [ ] Client is active/enabled

### 2.2 Redirect URIs Configuration

Verify these redirect URIs are registered in KOauth:

- [ ] `https://claude.ai/api/mcp/auth_callback` (web)
- [ ] `http://127.0.0.1:6277/callback` (desktop)
- [ ] `http://127.0.0.1:6278/callback` (desktop fallback)
- [ ] `http://127.0.0.1:6279/callback` (desktop fallback)

**Note:** URIs must match exactly (no trailing slashes, correct protocol)

### 2.3 Scopes Configuration

- [ ] `openid` scope is enabled
- [ ] `profile` scope is enabled
- [ ] `email` scope is enabled

## Phase 3: OAuth Flow Testing

### 3.1 Manual OAuth Authorization URL

Build and test authorization URL:

```bash
CLIENT_ID="your-client-id"
REDIRECT_URI="https://claude.ai/api/mcp/auth_callback"
SCOPE="openid profile email"
STATE="test-state-123"
CODE_CHALLENGE="test-challenge"
CODE_CHALLENGE_METHOD="S256"

AUTH_URL="https://auth.tillmaessen.de/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=$SCOPE&state=$STATE&code_challenge=$CODE_CHALLENGE&code_challenge_method=$CODE_CHALLENGE_METHOD"

echo $AUTH_URL
```

- [ ] URL is properly formatted
- [ ] All parameters are present
- [ ] Redirect URI matches registered URI exactly
- [ ] Opening URL in browser redirects to KOauth login

### 3.2 OAuth Authorization Flow

1. Open authorization URL in browser
2. Log in to KOauth
3. Approve authorization request
4. Verify redirect back with authorization code

- [ ] Login page loads correctly
- [ ] Login succeeds
- [ ] Consent screen appears (if first time)
- [ ] Authorization succeeds
- [ ] Redirect includes `code` parameter
- [ ] Redirect includes `state` parameter
- [ ] Redirect URI matches exactly

### 3.3 Token Exchange

Test token exchange (requires authorization code from 3.2):

```bash
curl -X POST https://auth.tillmaessen.de/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTHORIZATION_CODE_FROM_STEP_3_2" \
  -d "redirect_uri=https://claude.ai/api/mcp/auth_callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code_verifier=CODE_VERIFIER"
```

**Expected:** HTTP 200 with access token
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "..."
}
```

- [ ] Token exchange succeeds
- [ ] Access token is returned
- [ ] Token type is "Bearer"
- [ ] Expires_in is present

### 3.4 Token Validation

Test that MCP server validates tokens:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" https://kura.tillmaessen.de/mcp/sse
```

**Expected:** SSE connection established (not 401)

- [ ] Token is accepted (not 401)
- [ ] Connection succeeds
- [ ] User context is correct

## Phase 4: MCP Inspector Testing

### 4.1 Install MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

- [ ] Inspector installs successfully
- [ ] Inspector starts without errors

### 4.2 Configure Inspector

1. Select transport: **SSE** or **Streamable HTTP**
2. Enter server URL: `https://kura.tillmaessen.de/mcp/sse`
3. Configure authentication

- [ ] Transport selection works
- [ ] Server URL is accepted
- [ ] Authentication options appear

### 4.3 OAuth Flow in Inspector

1. Click **Open Auth Settings**
2. Follow **Quick OAuth Flow**
3. Complete authentication
4. Copy access token

- [ ] Auth settings open correctly
- [ ] OAuth flow initiates
- [ ] Redirect to KOauth works
- [ ] Login succeeds
- [ ] Token is returned
- [ ] Inspector connects successfully

### 4.4 Test MCP Tools

In MCP Inspector, test each tool:

- [ ] `kura_search` - Search notes
- [ ] `kura_create` - Create note
- [ ] `kura_get` - Get note by ID
- [ ] `kura_list_recent` - List recent notes
- [ ] `kura_delete` - Delete note

- [ ] All tools respond correctly
- [ ] Results match expected format
- [ ] Errors are handled gracefully

## Phase 5: Claude Web App Testing

### 5.1 Add Connector

1. Go to Claude web app
2. Settings → Connectors
3. Add custom connector
4. Enter server URL and OAuth credentials

- [ ] Connector can be added
- [ ] Form accepts all inputs
- [ ] Validation works correctly

### 5.2 Connect Connector

1. Click **Connect** on connector
2. Complete OAuth flow
3. Verify connection status

- [ ] Connect button works
- [ ] OAuth flow initiates
- [ ] Redirect to KOauth works
- [ ] Login succeeds
- [ ] Redirect back to Claude works
- [ ] Connector shows as **Connected**

### 5.3 Test Functionality

Try these commands in Claude:

```
Search my KURA notes for "test"
```

```
Create a note in KURA with title "Test Note" and content "This is a test"
```

```
Show me my recent notes from KURA
```

- [ ] Search works correctly
- [ ] Create works correctly
- [ ] List works correctly
- [ ] Results are accurate
- [ ] Errors are handled gracefully

## Phase 6: Claude Desktop App Testing

### 6.1 Add Connector

1. Open Claude Desktop
2. Settings → Connectors
3. Add custom connector
4. Enter server URL and OAuth credentials

- [ ] Connector can be added
- [ ] Form accepts all inputs
- [ ] Validation works correctly

### 6.2 Connect Connector

1. Click **Connect** on connector
2. Browser opens for OAuth
3. Complete OAuth flow
4. Return to Claude Desktop

- [ ] Connect button works
- [ ] Browser opens correctly
- [ ] OAuth flow completes
- [ ] Connector shows as **Connected**

### 6.3 Test Functionality

Same tests as Phase 5.3:

- [ ] Search works correctly
- [ ] Create works correctly
- [ ] List works correctly
- [ ] Results are accurate
- [ ] Errors are handled gracefully

## Phase 7: Error Scenarios

### 7.1 Invalid Token

```bash
curl -H "Authorization: Bearer invalid-token" https://kura.tillmaessen.de/mcp/sse
```

- [ ] Returns 401
- [ ] Error message is clear
- [ ] No sensitive information leaked

### 7.2 Expired Token

Test with expired token:

- [ ] Returns 401
- [ ] Error indicates expiration
- [ ] Suggests re-authentication

### 7.3 Missing Token

```bash
curl https://kura.tillmaessen.de/mcp/sse
```

- [ ] Returns 401
- [ ] WWW-Authenticate header present
- [ ] Points to discovery endpoint

### 7.4 Invalid Redirect URI

Test OAuth flow with unregistered redirect URI:

- [ ] OAuth flow fails gracefully
- [ ] Error message is clear
- [ ] No sensitive information leaked

## Phase 8: Performance Testing

### 8.1 Response Times

Test endpoint response times:

```bash
time curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
time curl https://kura.tillmaessen.de/mcp/health
```

- [ ] Discovery endpoint < 200ms
- [ ] Health endpoint < 100ms
- [ ] Acceptable for production use

### 8.2 Concurrent Connections

Test multiple simultaneous connections:

- [ ] Multiple connections work
- [ ] No connection limits exceeded
- [ ] Performance remains acceptable

## Phase 9: Security Testing

### 9.1 HTTPS Enforcement

- [ ] HTTP redirects to HTTPS
- [ ] No mixed content warnings
- [ ] SSL certificate is valid

### 9.2 Token Security

- [ ] Tokens are not logged
- [ ] Tokens are not exposed in errors
- [ ] Token validation is secure

### 9.3 CORS Security

- [ ] CORS headers are correct
- [ ] No overly permissive origins
- [ ] Preflight requests work

## Phase 10: Documentation Verification

- [ ] Setup guide is complete
- [ ] Troubleshooting guide covers common issues
- [ ] Examples are accurate
- [ ] Commands are tested and work

## Automated Testing Script

Run the comprehensive debug script:

```bash
cd mcp
./debug-oauth.sh
```

**Expected:** All tests pass

- [ ] Health endpoint: ✅
- [ ] Discovery endpoint: ✅
- [ ] SSE endpoint: ✅
- [ ] KOauth metadata: ✅
- [ ] CORS headers: ✅

## Final Checklist

Before considering the integration complete:

- [ ] All Phase 1 tests pass
- [ ] OAuth client is configured correctly
- [ ] OAuth flow works end-to-end
- [ ] MCP Inspector connects successfully
- [ ] Claude web app connects successfully
- [ ] Claude desktop app connects successfully
- [ ] All MCP tools work correctly
- [ ] Error handling works correctly
- [ ] Performance is acceptable
- [ ] Security is verified
- [ ] Documentation is complete

## Troubleshooting

If any test fails:

1. Check MCP server logs: `docker logs kura-notes-mcp`
2. Check KOauth logs (if accessible)
3. Run debug script: `./mcp/debug-oauth.sh`
4. Review [DEBUG-CLAUDE-CONNECTOR.md](../DEBUG-CLAUDE-CONNECTOR.md)
5. Review [CLAUDE-CONNECTOR-SETUP.md](./CLAUDE-CONNECTOR-SETUP.md)

## Next Steps

After all tests pass:

1. Document any custom configurations
2. Set up monitoring/alerts
3. Train users on using the connector
4. Schedule regular security audits

---

**Last Updated:** 2025-01-15  
**Status:** ✅ Comprehensive Testing Checklist
