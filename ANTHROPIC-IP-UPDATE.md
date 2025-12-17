# Anthropic MCP Server IP Address Update

**Action Required By:** January 15, 2026
**Status:** Pending implementation
**Priority:** High - affects MCP server connectivity

---

## Overview

Anthropic is consolidating their outbound IP addresses for Claude.ai MCP server connections. We need to update our VPS firewall configuration to ensure continued connectivity.

---

## IP Address Changes

### New IP Range (Add by January 15, 2026)
```
160.79.104.0/21
```

This CIDR range includes:
- Start IP: 160.79.104.0
- End IP: 160.79.111.255
- Total IPs: 2,048 addresses

### Legacy IP Addresses (Can remove after April 1, 2026)
```
34.162.46.92/32
34.162.102.82/32
34.162.136.91/32
34.162.142.92/32
34.162.183.95/32
```

---

## Current Firewall Configuration

**Our VPS setup:**
- **Provider:** Contabo VPS (IP: 167.86.121.109)
- **Domain:** kura.tillmaessen.de
- **Firewall:** UFW (Uncomplicated Firewall)
- **MCP Server:** Running on port 3001, exposed via Caddy on HTTPS (port 443)

**Current Status:**
- ✅ Port 443 is open to **ALL IP addresses** (0.0.0.0/0)
- ⚠️ **Security Issue:** No IP restrictions on MCP endpoint
- ✅ MCP server will continue working after Jan 15, 2026 (but not optimal)

---

## Recommended Security Improvement

While our current setup will continue to work, we **SHOULD** restrict MCP access to only Anthropic's IP addresses for better security.

### Option 1: Simple (Keep current setup) ⚠️
**Action:** None required
**Security:** Low - anyone can attempt to connect to your MCP server
**Compatibility:** Works with all current and future Anthropic IPs

### Option 2: Secure (Recommended) ✅
**Action:** Implement IP-based restrictions
**Security:** High - only Anthropic can connect to MCP endpoint
**Compatibility:** Requires maintenance when IPs change

**We recommend Option 2** - restricting access to Anthropic IPs only.

---

## Implementation Options

### A. Application-Level Restriction (Recommended)

Restrict access in Caddy configuration to only allow Anthropic IPs for the `/mcp*` endpoint.

**Advantages:**
- Granular control (only affects MCP, not main API)
- Can still access main API from anywhere
- No interference with other VPS services

**Implementation:**

1. **SSH into your VPS:**
```bash
ssh root@167.86.121.109
```

2. **Edit Caddy configuration:**
```bash
sudo nano /etc/caddy/Caddyfile
```

3. **Update configuration:**
```caddy
kura.tillmaessen.de {
    # Main API - accessible from anywhere
    reverse_proxy localhost:3000

    # MCP Server - restricted to Anthropic IPs only
    handle /mcp* {
        # Block all by default
        @anthropic_ips {
            # New IP range (active from Jan 15, 2026)
            remote_ip 160.79.104.0/21

            # Legacy IPs (can remove after April 1, 2026)
            remote_ip 34.162.46.92/32 34.162.102.82/32 34.162.136.91/32 34.162.142.92/32 34.162.183.95/32
        }

        # Allow Anthropic IPs
        route {
            @blocked not remote_ip 160.79.104.0/21 34.162.46.92/32 34.162.102.82/32 34.162.136.91/32 34.162.142.92/32 34.162.183.95/32
            abort @blocked
            reverse_proxy localhost:3001
        }
    }
}
```

4. **Validate and restart Caddy:**
```bash
# Validate configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
sudo systemctl restart caddy

# Check status
sudo systemctl status caddy

# View logs if issues
sudo journalctl -u caddy -f
```

### B. UFW Firewall Restriction (More restrictive)

**WARNING:** This approach restricts ALL HTTPS traffic (port 443) to only Anthropic IPs. This means:
- ⚠️ Your main API at kura.tillmaessen.de will ONLY be accessible from Anthropic IPs
- ⚠️ You won't be able to access your API from your phone, computer, or other devices
- ⚠️ Only suitable if you ONLY use the MCP server and don't access the API directly

**Only use this if you want to completely lock down port 443 to Anthropic only.**

Commands (use with caution):
```bash
# Delete existing rule allowing all HTTPS traffic
sudo ufw delete allow 443/tcp

# Add new IP range (required by Jan 15, 2026)
sudo ufw allow from 160.79.104.0/21 to any port 443 proto tcp comment 'Anthropic MCP - New Range'

# Add legacy IPs (keep until April 1, 2026)
sudo ufw allow from 34.162.46.92 to any port 443 proto tcp comment 'Anthropic MCP - Legacy 1'
sudo ufw allow from 34.162.102.82 to any port 443 proto tcp comment 'Anthropic MCP - Legacy 2'
sudo ufw allow from 34.162.136.91 to any port 443 proto tcp comment 'Anthropic MCP - Legacy 3'
sudo ufw allow from 34.162.142.92 to any port 443 proto tcp comment 'Anthropic MCP - Legacy 4'
sudo ufw allow from 34.162.183.95 to any port 443 proto tcp comment 'Anthropic MCP - Legacy 5'

# Reload firewall
sudo ufw reload

# Check rules
sudo ufw status verbose
```

**To revert back to open access:**
```bash
sudo ufw delete allow from 160.79.104.0/21 to any port 443 proto tcp
sudo ufw delete allow from 34.162.46.92 to any port 443 proto tcp
sudo ufw delete allow from 34.162.102.82 to any port 443 proto tcp
sudo ufw delete allow from 34.162.136.91 to any port 443 proto tcp
sudo ufw delete allow from 34.162.142.92 to any port 443 proto tcp
sudo ufw delete allow from 34.162.183.95 to any port 443 proto tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

---

## Contabo Control Panel Firewall

Contabo has a **separate external firewall** in their control panel. Check if it has any restrictions:

1. Log into Contabo customer portal
2. Navigate to your VPS → Firewall settings
3. Ensure ports 80 and 443 are allowed
4. (Optional) Add the Anthropic IP restrictions there as well

---

## Testing After Implementation

### Test MCP Server Connectivity

1. **From Claude.ai (after implementation):**
   - Go to Settings → MCP Servers
   - Verify your MCP server is still connected and working

2. **Manual test (if you have access to Anthropic IPs):**
```bash
curl -I https://kura.tillmaessen.de/mcp/sse
```

Should return HTTP headers indicating the endpoint is accessible.

3. **Test main API still works (if using Caddy approach):**
```bash
curl https://kura.tillmaessen.de/api/health \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Should return `{"status":"healthy",...}`

---

## Maintenance Schedule

### Before January 15, 2026
- ✅ Add new IP range: 160.79.104.0/21
- ✅ Keep legacy IPs active
- ✅ Test MCP server connectivity

### Between January 15 - April 1, 2026
- ✅ Both old and new IPs are active
- ✅ Monitor for any connection issues
- ✅ Verify MCP server works correctly

### After April 1, 2026
- 🗑️ Remove legacy IP addresses from firewall/Caddy config
- ✅ Only new IP range remains: 160.79.104.0/21

---

## Rollback Plan

If you experience issues after implementing IP restrictions:

**Caddy Rollback:**
```bash
# Restore simple Caddy config (no IP restrictions)
sudo nano /etc/caddy/Caddyfile

# Replace with:
kura.tillmaessen.de {
    reverse_proxy localhost:3000
    handle /mcp* {
        reverse_proxy localhost:3001
    }
}

# Restart
sudo systemctl restart caddy
```

**UFW Rollback:**
```bash
# Remove all IP-specific rules for port 443
sudo ufw delete allow from 160.79.104.0/21 to any port 443 proto tcp
# ... repeat for other IPs ...

# Re-allow all HTTPS traffic
sudo ufw allow 443/tcp
sudo ufw reload
```

---

## Security Considerations

### Why Restrict IPs?

**Without IP restrictions:**
- ❌ Anyone can attempt to connect to your MCP endpoint
- ❌ Potential for DDoS or abuse
- ❌ Unnecessary exposure of internal endpoints

**With IP restrictions:**
- ✅ Only Anthropic's Claude.ai can connect
- ✅ Reduces attack surface
- ✅ Better security posture
- ✅ Compliance with principle of least privilege

### Additional Security Measures

Consider also implementing:
- Rate limiting in Caddy
- Authentication for MCP endpoint (if supported)
- Monitoring and alerting for failed connection attempts
- Regular security audits

---

## Quick Reference

| Timeline | Action | Details |
|----------|--------|---------|
| **Now - Jan 15, 2026** | Add new IP range | 160.79.104.0/21 |
| **Jan 15, 2026** | Anthropic starts using new IPs | Both old and new IPs active |
| **Jan 15 - Apr 1, 2026** | Transition period | Monitor connectivity |
| **After Apr 1, 2026** | Remove legacy IPs | Only new IP range needed |

---

## Support

- **Anthropic Support:** support@anthropic.com
- **IP Documentation:** https://docs.anthropic.com/mcp/ip-addresses
- **Contabo Support:** Via customer portal

---

## Status Checklist

- [ ] Read and understand IP changes
- [ ] Choose implementation approach (Caddy recommended)
- [ ] Backup current Caddy/UFW configuration
- [ ] Implement IP restrictions
- [ ] Test MCP server connectivity from Claude.ai
- [ ] Test main API accessibility (if needed)
- [ ] Document changes in deployment notes
- [ ] Set calendar reminder for April 1, 2026 (remove legacy IPs)

---

**Last Updated:** 2025-12-17
**Next Review:** 2026-01-15 (Implementation deadline)
**Cleanup Date:** 2026-04-01 (Remove legacy IPs)
