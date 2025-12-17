# Recommended Caddyfile for Multi-Service MCP Access

**Philosophy:** Use application-level authentication instead of IP restrictions for better security and flexibility.

## Why This Approach?

**IP Restrictions = BAD for multi-service:**
- ❌ Doesn't scale (need to track every client's IPs)
- ❌ IPs can change or be spoofed
- ❌ Cloud services often use dynamic IPs
- ❌ Doesn't tell you WHO is accessing

**Application Authentication = GOOD:**
- ✅ Scales to unlimited clients
- ✅ Each client has unique credentials
- ✅ Can revoke access per client
- ✅ Audit trail of who accessed what
- ✅ Works with your existing KOauth setup

## Recommended Caddyfile

```caddy
# The Caddyfile is an easy way to configure your Caddy web server.

kura.tillmaessen.de {
	@notapi {
		not path /api/*
	}

	# MCP endpoint - authentication handled by application
	# Your MCP server already validates JWT tokens and API keys
	reverse_proxy /mcp* localhost:3001

	# Reverse proxy everything else (main API)
	reverse_proxy localhost:3000
}

auth.tillmaessen.de {
	# KOauth service for authentication
	reverse_proxy localhost:3002
}

# MCP endpoint on separate subdomain
mcp.tillmaessen.de {
	# Direct access to MCP server
	# Authentication handled by application (JWT/API keys)
	reverse_proxy localhost:3001
}
```

## Security Checklist

### ✅ Current Security Measures
- [x] HTTPS with Let's Encrypt (Caddy)
- [x] Application-level authentication (KOauth + JWT)
- [x] API key validation in MCP server
- [x] UFW firewall enabled
- [x] OAuth 2.0 integration

### 📋 Recommended Additions

#### 1. Add Rate Limiting (Optional but Recommended)

**Option A: UFW-level (simple)**
```bash
# Remove current 443 rule
sudo ufw delete allow 443/tcp

# Add with rate limiting (max 100 connections per minute per IP)
sudo ufw limit 443/tcp comment 'HTTPS with rate limit'
```

**Option B: Caddy-level (requires plugin)**
See: https://github.com/mholt/caddy-ratelimit

**Option C: Application-level**
Add rate limiting middleware to your MCP server (most flexible)

#### 2. Implement Request Logging
Add access logging to your MCP server to track:
- Who is connecting (via API key/token)
- When they connected
- What they're requesting
- Failed authentication attempts

#### 3. Add Monitoring
Set up monitoring for:
- Failed authentication attempts
- Unusual traffic patterns
- Service availability

#### 4. Consider fail2ban
Automatically ban IPs with repeated failed auth attempts:
```bash
sudo apt install fail2ban
# Configure to watch MCP server logs
```

## For Anthropic Specifically

Since Anthropic will be a major client, you can:

1. **Create a dedicated API key** for Anthropic in your KOauth system
2. **Monitor Anthropic's usage** separately
3. **Set up alerts** if Anthropic connection fails

This gives you:
- ✅ Security (only Anthropic with valid key can access)
- ✅ Flexibility (can revoke/rotate keys)
- ✅ Visibility (see all Anthropic requests)
- ✅ Future-proof (add more clients easily)

## Client Onboarding Process

When adding new MCP clients (Anthropic, other services):

1. **Generate API key** or **OAuth client credentials** via KOauth
2. **Share credentials** securely with client
3. **Configure client** to use:
   - URL: `https://mcp.tillmaessen.de/sse` or `https://kura.tillmaessen.de/mcp/sse`
   - Authentication: Bearer token or API key header
4. **Monitor usage** via logs
5. **Revoke if needed** by deactivating the key

## Migration from IP Restrictions

If you already implemented Anthropic IP restrictions:

1. Remove IP-based rules from Caddyfile
2. Ensure your MCP server authentication is working
3. Test with Anthropic connection
4. Remove UFW IP restrictions (if any)

## Testing

After applying this config:

```bash
# 1. Validate Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile

# 2. Restart Caddy
sudo systemctl restart caddy

# 3. Test MCP endpoint is accessible
curl -I https://mcp.tillmaessen.de/sse

# 4. Test authentication is required (should fail without auth)
curl https://mcp.tillmaessen.de/sse
# Should return 401 Unauthorized

# 5. Test with valid API key (should succeed)
curl https://mcp.tillmaessen.de/sse \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Summary

**Don't use IP restrictions** - they're inflexible and don't scale.

**Do use application authentication** - you already have it, just make sure it's enabled and working.

**Add rate limiting** - either at UFW, Caddy, or application level to prevent abuse.

**Monitor and log** - know who's accessing your MCP server and when.
