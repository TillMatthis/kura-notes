# MCP OAuth Troubleshooting Guide

## Issue: Claude Custom Connector Not Connecting

### Symptoms
- Enter MCP URL in Claude Custom Connectors
- Click "Connect" 
- Redirects to Claude URL but nothing happens
- Status still shows "Connect" (not connected)

### Root Causes

1. **Discovery Endpoint Not Accessible**
   - The `/.well-known/oauth-protected-resource` endpoint returns 404
   - Caddy reverse proxy not routing correctly

2. **OAuth Flow Not Completing**
   - Claude redirects to OAuth but callback fails
   - OAuth client not registered in KOauth
   - Redirect URI mismatch

### Step-by-Step Troubleshooting

#### 1. Verify Discovery Endpoint

Test the discovery endpoint:

```bash
# Via HTTPS (through Caddy)
curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource

# Should return:
# {
#   "resource": "https://kura.tillmaessen.de/mcp/sse",
#   "authorization_servers": ["https://auth.tillmaessen.de"],
#   "scopes_supported": ["openid", "profile", "email"]
# }
```

**If 404:**
- Check Caddy configuration routes `/mcp*` to port 3001
- Verify MCP server is running: `docker ps | grep mcp`
- Check MCP server logs: `docker logs kura-notes-mcp`

#### 2. Verify SSE Endpoint Returns 401

Test unauthenticated access:

```bash
curl -v https://kura.tillmaessen.de/mcp/sse

# Should return:
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer realm="https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource"
```

**If wrong status:**
- MCP server needs to return 401 with WWW-Authenticate header
- Check server logs for errors

#### 3. Verify OAuth Client Registration

Claude Custom Connectors need an OAuth client registered in KOauth:

1. **Check KOauth Dashboard:**
   - Go to `https://auth.tillmaessen.de/dashboard`
   - Navigate to OAuth Clients section
   - Look for a client for Claude/MCP

2. **Register OAuth Client (if missing):**
   - Client ID: `claude-mcp` (or similar)
   - Redirect URIs: 
     - `https://claude.ai/oauth/callback` (for Claude web)
     - `claude://claude.ai/settings/connectors` (for Claude desktop/mobile)
   - Scopes: `openid profile email`

3. **Note:** Claude may handle OAuth differently - check Claude's documentation for exact redirect URI format

#### 4. Check Caddy Configuration

Verify `/etc/caddy/Caddyfile` has correct routing:

```caddyfile
kura.tillmaessen.de {
    # Main API
    reverse_proxy localhost:3000

    # MCP Server - route /mcp* to port 3001
    handle /mcp* {
        reverse_proxy localhost:3001
    }
}
```

**Important:** The MCP server now handles both `/mcp/.well-known/...` and `/.well-known/...` paths, so Caddy forwarding the full path should work.

#### 5. Test OAuth Flow Manually

1. **Get authorization URL:**
   ```bash
   # Replace CLIENT_ID with your OAuth client ID
   echo "https://auth.tillmaessen.de/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=https://claude.ai/oauth/callback&scope=openid%20profile%20email"
   ```

2. **Open in browser** - should redirect to KOauth login

3. **After login** - should redirect back to Claude (if redirect URI matches)

#### 6. Check MCP Server Logs

```bash
# View real-time logs
docker logs -f kura-notes-mcp

# Look for:
# - OAuth discovery requests
# - 401 responses
# - Authentication errors
```

### Common Fixes

#### Fix 1: Set MCP_BASE_URL Environment Variable

Add to `.env`:

```bash
MCP_BASE_URL=https://kura.tillmaessen.de/mcp
```

Then restart MCP server:

```bash
docker-compose restart mcp
```

#### Fix 2: Update Caddy Configuration

If Caddy is stripping the `/mcp` prefix, update Caddyfile:

```caddyfile
kura.tillmaessen.de {
    reverse_proxy localhost:3000

    handle /mcp* {
        uri strip_prefix /mcp
        reverse_proxy localhost:3001
    }
}
```

**OR** keep current config and let MCP server handle `/mcp` prefix (current implementation).

#### Fix 3: Verify OAuth Client Redirect URIs

Claude Custom Connectors may use specific redirect URIs. Check Claude's documentation or try:

- `https://claude.ai/oauth/callback`
- `claude://claude.ai/settings/connectors`
- `http://127.0.0.1:6277/callback` (for desktop)

Register all possible redirect URIs in KOauth.

### Testing After Fixes

1. **Rebuild and restart MCP server:**
   ```bash
   cd mcp
   npm run build
   docker-compose restart mcp
   ```

2. **Test discovery endpoint:**
   ```bash
   curl https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
   ```

3. **Test SSE endpoint (should return 401):**
   ```bash
   curl -v https://kura.tillmaessen.de/mcp/sse
   ```

4. **Try connecting in Claude Custom Connectors again**

### Still Not Working?

1. **Check Claude's OAuth requirements:**
   - Claude may require specific OAuth client configuration
   - Check Claude's Custom Connector documentation

2. **Try manual bearer token:**
   - Generate API key from KOauth dashboard
   - In Claude Custom Connectors, provide bearer token instead of using OAuth
   - This bypasses OAuth flow entirely

3. **Check network/firewall:**
   - Ensure HTTPS is working (Let's Encrypt certificate)
   - Check firewall allows connections to port 443

4. **Review all logs:**
   ```bash
   # MCP server logs
   docker logs kura-notes-mcp
   
   # Caddy logs
   sudo journalctl -u caddy -f
   
   # KOauth logs (if accessible)
   docker logs koauth
   ```
