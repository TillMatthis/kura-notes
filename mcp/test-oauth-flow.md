# Testing OAuth Flow for Claude Custom Connectors

## Quick Debug Commands

Run the debugging script:

```bash
cd mcp
./debug-oauth.sh
```

Or test manually:

```bash
# 1. Test discovery endpoint
curl -v https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource

# 2. Test SSE endpoint (should return 401)
curl -v https://kura.tillmaessen.de/mcp/sse

# 3. Check MCP server logs
docker logs kura-notes-mcp --tail 50

# 4. Test KOauth discovery
curl https://auth.tillmaessen.de/.well-known/oauth-authorization-server
```

## Common Issues and Fixes

### Issue 1: Discovery Endpoint Returns 404

**Symptom:** `curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource` returns 404

**Fix:**
1. Check Caddy routes `/mcp*` to port 3001
2. Verify MCP server is running: `docker ps | grep mcp`
3. Restart MCP server: `docker-compose restart mcp`
4. Check MCP server logs for errors

### Issue 2: Discovery Endpoint Returns Wrong JSON

**Symptom:** Endpoint works but JSON structure is wrong

**Expected:**
```json
{
  "resource": "https://kura.tillmaessen.de/mcp/sse",
  "authorization_servers": ["https://auth.tillmaessen.de"],
  "scopes_supported": ["openid", "profile", "email"]
}
```

**Fix:**
- Set `MCP_BASE_URL=https://kura.tillmaessen.de/mcp` in `.env`
- Restart MCP server

### Issue 3: OAuth Redirect Not Working

**Symptom:** Claude redirects but OAuth flow doesn't complete

**Possible Causes:**
1. OAuth client redirect URI doesn't match Claude's expectation
2. OAuth client not properly configured in KOauth
3. Claude expects different OAuth flow

**Fix:**
1. Check what redirect URI Claude uses (check browser network tab)
2. Register that exact redirect URI in KOauth OAuth client
3. Common redirect URIs Claude might use:
   - `https://claude.ai/oauth/callback`
   - `claude://claude.ai/settings/connectors`
   - `http://127.0.0.1:6277/callback` (desktop)

### Issue 4: OAuth Client Not Found

**Symptom:** OAuth authorization fails with "invalid_client"

**Fix:**
1. Verify OAuth client exists in KOauth dashboard
2. Check client ID matches what you entered in Claude
3. Verify client secret is correct
4. Ensure OAuth client is enabled/active

## Manual OAuth Flow Test

To test the OAuth flow manually:

1. **Get authorization URL:**
   ```bash
   CLIENT_ID="claude-mcp"
   REDIRECT_URI="https://claude.ai/oauth/callback"
   SCOPE="openid profile email"
   STATE="test-state"
   
   echo "https://auth.tillmaessen.de/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=$SCOPE&state=$STATE"
   ```

2. **Open URL in browser** - should redirect to KOauth login

3. **After login** - should redirect back with `code` parameter

4. **If redirect fails** - check redirect URI matches exactly

## Checking Claude's Network Requests

To see what Claude is actually requesting:

1. Open Claude web app in browser
2. Open Developer Tools (F12)
3. Go to Network tab
4. Try to connect Custom Connector
5. Look for requests to:
   - `/.well-known/oauth-protected-resource`
   - `/sse`
   - OAuth authorization endpoint
6. Check response status codes and error messages

## MCP Server Logs

Check what the MCP server sees:

```bash
# Follow logs in real-time
docker logs -f kura-notes-mcp

# Look for:
# - Requests to /.well-known/oauth-protected-resource
# - Requests to /sse
# - 401 responses
# - Authentication errors
```

## Caddy Logs

Check reverse proxy logs:

```bash
# Follow Caddy logs
sudo journalctl -u caddy -f

# Look for:
# - Requests to /mcp/*
# - 404 errors
# - Routing issues
```



