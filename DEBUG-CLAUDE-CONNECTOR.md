# Debugging Claude Custom Connector Connection

## Step-by-Step Debugging Process

### Step 1: Run the Debug Script

```bash
cd mcp
./debug-oauth.sh
```

This will test all endpoints and show you what's working and what's not.

### Step 2: Check What Claude Actually Requests

When you click "Connect" in Claude Custom Connectors, Claude makes these requests:

1. **GET** `https://kura.tillmaessen.de/mcp/sse` (without auth)
   - Should return: `401 Unauthorized` with `WWW-Authenticate` header
   - Header should point to: `/.well-known/oauth-protected-resource`

2. **GET** `https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource`
   - Should return: JSON with OAuth configuration

3. **Redirect to OAuth** authorization endpoint
   - Uses `authorization_servers` from discovery response
   - Redirects user to KOauth for login

4. **OAuth callback** back to Claude
   - Claude receives authorization code
   - Claude exchanges code for access token

### Step 3: Test Each Step Manually

#### Test 1: Discovery Endpoint

```bash
curl -v https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource
```

**Expected Response:**
```json
{
  "resource": "https://kura.tillmaessen.de/mcp/sse",
  "authorization_servers": ["https://auth.tillmaessen.de"],
  "scopes_supported": ["openid", "profile", "email"]
}
```

**If 404:**
- MCP server not running or Caddy not routing correctly
- Check: `docker ps | grep mcp`
- Check: `docker logs kura-notes-mcp`

#### Test 2: SSE Endpoint (Unauthenticated)

```bash
curl -v https://kura.tillmaessen.de/mcp/sse
```

**Expected Response:**
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource"
```

**If wrong status:**
- Check MCP server logs
- Verify authentication middleware is working

#### Test 3: Check MCP Server Logs

```bash
# Follow logs in real-time
docker logs -f kura-notes-mcp
```

**What to look for:**
- Requests to `/.well-known/oauth-protected-resource`
- Requests to `/sse`
- 401 responses
- Any errors

**When you click "Connect" in Claude, you should see:**
```
Unauthenticated SSE connection attempt from: ...
OAuth discovery request: ...
```

### Step 4: Verify OAuth Client Configuration

1. **Check OAuth client exists in KOauth:**
   - Go to `https://auth.tillmaessen.de/dashboard`
   - Navigate to OAuth Clients
   - Find `claude-mcp` (or whatever you named it)

2. **Verify redirect URIs:**
   - Claude might use: `https://claude.ai/oauth/callback`
   - Or: `claude://claude.ai/settings/connectors`
   - Check Claude's documentation for exact format
   - **Important:** Redirect URI must match EXACTLY

3. **Check client ID and secret:**
   - Client ID should match what you entered in Claude
   - Client secret should match what you entered in Claude

### Step 5: Test OAuth Flow Manually

1. **Build authorization URL:**
   ```bash
   CLIENT_ID="claude-mcp"  # Your actual client ID
   REDIRECT_URI="https://claude.ai/oauth/callback"  # What Claude expects
   SCOPE="openid profile email"
   STATE="test-state-123"
   
   AUTH_URL="https://auth.tillmaessen.de/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=$SCOPE&state=$STATE"
   
   echo $AUTH_URL
   ```

2. **Open URL in browser:**
   - Should redirect to KOauth login
   - After login, should redirect back
   - Check if redirect URI matches

3. **If redirect fails:**
   - Check redirect URI in KOauth matches exactly
   - Check KOauth logs for errors

### Step 6: Check Browser Network Tab

1. Open Claude web app in browser
2. Open Developer Tools (F12)
3. Go to Network tab
4. Clear network log
5. Try to connect Custom Connector
6. Look for:
   - Request to `/.well-known/oauth-protected-resource`
   - Request to `/sse`
   - OAuth authorization request
   - Check status codes and error messages

### Step 7: Common Issues

#### Issue: Discovery Endpoint Returns 404

**Fix:**
```bash
# 1. Check MCP server is running
docker ps | grep mcp

# 2. Check Caddy configuration
sudo cat /etc/caddy/Caddyfile | grep mcp

# 3. Restart MCP server
docker-compose restart mcp

# 4. Test locally
curl http://localhost:3001/.well-known/oauth-protected-resource
```

#### Issue: Wrong Base URL in Discovery Response

**Fix:**
Add to `.env`:
```bash
MCP_BASE_URL=https://kura.tillmaessen.de/mcp
```

Then restart:
```bash
docker-compose restart mcp
```

#### Issue: OAuth Redirect Not Working

**Possible causes:**
1. Redirect URI doesn't match
2. OAuth client not configured correctly
3. Claude expects different OAuth flow

**Fix:**
1. Check what redirect URI Claude actually uses (browser network tab)
2. Register that exact URI in KOauth
3. Try different redirect URIs Claude might accept

#### Issue: Claude Shows "Connect" But Doesn't Connect

**Possible causes:**
1. Discovery endpoint not accessible
2. OAuth flow not completing
3. Claude can't exchange authorization code for token

**Debug:**
1. Check MCP server logs for requests
2. Check browser network tab for failed requests
3. Check KOauth logs for OAuth errors
4. Verify OAuth client configuration

### Step 8: Get More Information

Run these commands and share the output:

```bash
# 1. Test discovery endpoint
curl -v https://kura.tillmaessen.de/mcp/.well-known/oauth-protected-resource

# 2. Test SSE endpoint
curl -v https://kura.tillmaessen.de/mcp/sse

# 3. Check MCP server logs
docker logs kura-notes-mcp --tail 100

# 4. Check if MCP server is running
docker ps | grep mcp

# 5. Test health endpoint
curl https://kura.tillmaessen.de/mcp/health
```

### Step 9: Alternative: Use API Key Instead

If OAuth continues to fail, you can use an API key:

1. Generate API key from KOauth dashboard
2. In Claude Custom Connectors, instead of OAuth:
   - Use "Bearer Token" authentication
   - Enter: `Bearer YOUR_API_KEY_HERE`
3. This bypasses OAuth flow entirely

## Next Steps

1. Run the debug script: `./mcp/debug-oauth.sh`
2. Check MCP server logs when clicking "Connect"
3. Check browser network tab for failed requests
4. Review the comprehensive setup guide: `docs/CLAUDE-CONNECTOR-SETUP.md`
5. Follow the testing checklist: `docs/CLAUDE-CONNECTOR-TESTING.md`
6. Share the outputs so we can identify the exact issue

## Additional Resources

- **Complete Setup Guide**: `docs/CLAUDE-CONNECTOR-SETUP.md` - Step-by-step instructions for setting up Claude Custom Connector
- **Testing Checklist**: `docs/CLAUDE-CONNECTOR-TESTING.md` - Comprehensive testing checklist
- **MCP Setup Guide**: `MCP-SETUP-GUIDE.md` - General MCP setup documentation


