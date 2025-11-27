# KOauth Setup Guide for KURA Notes

**Last Updated:** 2025-11-27
**Status:** Multi-user authentication with KOauth

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [OAuth Provider Configuration](#oauth-provider-configuration)
6. [DNS Configuration](#dns-configuration)
7. [Reverse Proxy Setup](#reverse-proxy-setup)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

---

## Overview

KURA Notes uses **KOauth** for multi-user authentication. KOauth provides:

- 🔐 **JWT-based authentication** with HTTP-only cookies
- 👤 **Multiple login methods**: Email/password, Google OAuth, GitHub OAuth
- 🔑 **API key generation** for programmatic access (iOS Shortcuts, scripts)
- 🛡️ **User isolation**: Each user's data is completely separated
- 🎯 **Session management**: Secure session handling with token refresh

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser/App                     │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        │                                │
        ▼                                ▼
┌───────────────┐              ┌──────────────────┐
│  KURA Notes   │◄─────────────┤     KOauth       │
│  (Port 3000)  │ Verify Token │  (Port 3001)     │
│               │              │                  │
│  - API        │              │  - Login/Signup  │
│  - Web UI     │              │  - JWT Tokens    │
│  - Content    │              │  - OAuth Flow    │
└───────┬───────┘              └────────┬─────────┘
        │                               │
        ▼                               ▼
┌───────────────┐              ┌──────────────────┐
│   SQLite      │              │   PostgreSQL     │
│  (User Data)  │              │  (Auth Data)     │
└───────────────┘              └──────────────────┘
```

---

## Prerequisites

### Required

- ✅ Docker & Docker Compose (v2.0+)
- ✅ Domain with DNS management (e.g., `tillmaessen.de`)
- ✅ Server with public IP address
- ✅ Port 80 and 443 accessible (for HTTPS/SSL)

### Optional (but recommended)

- 🔹 Google OAuth App (for Google login)
- 🔹 GitHub OAuth App (for GitHub login)
- 🔹 Reverse proxy (Caddy recommended, handles SSL automatically)

---

## Quick Start

### 1. Generate Secrets

```bash
# Generate PostgreSQL password
openssl rand -hex 32

# Generate KOauth session secret (longer for JWT signing)
openssl rand -hex 64
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in these **required** values:

```bash
# Production mode
NODE_ENV=production

# KOauth Service Configuration
KOAUTH_DB_PASSWORD=<paste-generated-postgres-password>
KOAUTH_SESSION_SECRET=<paste-generated-session-secret>
KOAUTH_BASE_URL=https://auth.tillmaessen.de
KOAUTH_ALLOWED_CALLBACKS=https://kura.tillmaessen.de

# KURA Notes Configuration
KOAUTH_URL=https://auth.tillmaessen.de
OPENAI_API_KEY=sk-...
```

### 3. Set Up DNS

Create **two** DNS A records pointing to your server IP:

```
Type  | Name  | Value          | TTL
------|-------|----------------|-----
A     | kura  | <SERVER_IP>    | 3600
A     | auth  | <SERVER_IP>    | 3600
```

This creates:
- `https://kura.tillmaessen.de` → KURA Notes
- `https://auth.tillmaessen.de` → KOauth

### 4. Deploy Services

```bash
# Build and start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f koauth
docker compose logs -f api
```

### 5. Test Authentication

```bash
# Check KOauth health
curl https://auth.tillmaessen.de/health

# Expected response:
# {"status":"healthy"}

# Try accessing KURA Notes (should redirect to login)
curl -I https://kura.tillmaessen.de

# Expected: 302 redirect to https://auth.tillmaessen.de/login
```

---

## Detailed Setup

### Step 1: Update docker-compose.yml

✅ **Already done!** The `docker-compose.yml` includes:
- PostgreSQL database for KOauth
- KOauth service
- API service configured to use KOauth

### Step 2: Configure Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
nano .env
```

**Required variables:**

```bash
# =============================================================================
# KOauth Database
# =============================================================================
KOAUTH_DB_NAME=koauth
KOAUTH_DB_USER=koauth
KOAUTH_DB_PASSWORD=<generate-with-openssl>

# =============================================================================
# KOauth Service
# =============================================================================
KOAUTH_SESSION_SECRET=<generate-with-openssl>
KOAUTH_PORT=3001
KOAUTH_BASE_URL=https://auth.tillmaessen.de
KOAUTH_ALLOWED_CALLBACKS=https://kura.tillmaessen.de

# =============================================================================
# OAuth Providers (Optional but recommended)
# =============================================================================
KOAUTH_GOOGLE_CLIENT_ID=<from-google-console>
KOAUTH_GOOGLE_CLIENT_SECRET=<from-google-console>

KOAUTH_GITHUB_CLIENT_ID=<from-github-settings>
KOAUTH_GITHUB_CLIENT_SECRET=<from-github-settings>

# =============================================================================
# KURA Notes
# =============================================================================
KOAUTH_URL=https://auth.tillmaessen.de
OPENAI_API_KEY=sk-...
```

### Step 3: Set Up Reverse Proxy (Caddy - Recommended)

**Why Caddy?**
- Automatic HTTPS with Let's Encrypt
- Simple configuration
- Auto-renewal of certificates

#### Install Caddy

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### Configure Caddy

Create `/etc/caddy/Caddyfile`:

```caddy
# KURA Notes - Main Application
kura.tillmaessen.de {
    reverse_proxy localhost:3000

    # Optional: Enable gzip compression
    encode gzip

    # Security headers
    header {
        # Enable HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        # Prevent clickjacking
        X-Frame-Options "SAMEORIGIN"
        # Prevent MIME sniffing
        X-Content-Type-Options "nosniff"
        # Enable XSS protection
        X-XSS-Protection "1; mode=block"
    }
}

# KOauth - Authentication Service
auth.tillmaessen.de {
    reverse_proxy localhost:3001

    # Optional: Enable gzip compression
    encode gzip

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
}
```

#### Start Caddy

```bash
# Reload Caddy configuration
sudo systemctl reload caddy

# Check status
sudo systemctl status caddy

# View logs
sudo journalctl -u caddy -f
```

Caddy will automatically obtain SSL certificates from Let's Encrypt for both domains.

---

## OAuth Provider Configuration

### Google OAuth

1. **Go to Google Cloud Console:**
   - https://console.cloud.google.com/apis/credentials

2. **Create OAuth 2.0 Client ID:**
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: `KURA Notes Auth`

3. **Configure redirect URIs:**
   ```
   Authorized redirect URIs:
   https://auth.tillmaessen.de/auth/google/callback
   ```

4. **Copy credentials to `.env`:**
   ```bash
   KOAUTH_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   KOAUTH_GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

5. **Restart KOauth:**
   ```bash
   docker compose restart koauth
   ```

### GitHub OAuth

1. **Go to GitHub Developer Settings:**
   - https://github.com/settings/developers

2. **Create New OAuth App:**
   - Click "New OAuth App"
   - Application name: `KURA Notes`
   - Homepage URL: `https://kura.tillmaessen.de`
   - Authorization callback URL: `https://auth.tillmaessen.de/auth/github/callback`

3. **Generate client secret:**
   - After creating the app, click "Generate a new client secret"

4. **Copy credentials to `.env`:**
   ```bash
   KOAUTH_GITHUB_CLIENT_ID=<your-client-id>
   KOAUTH_GITHUB_CLIENT_SECRET=<your-client-secret>
   ```

5. **Restart KOauth:**
   ```bash
   docker compose restart koauth
   ```

---

## DNS Configuration

### Requirements

You need **two subdomains** pointing to your server:

1. `kura.tillmaessen.de` → KURA Notes application
2. `auth.tillmaessen.de` → KOauth authentication service

### Example (Cloudflare)

```
Type  | Name  | Content        | Proxy | TTL
------|-------|----------------|-------|------
A     | kura  | 123.45.67.89   | Yes   | Auto
A     | auth  | 123.45.67.89   | Yes   | Auto
```

**Notes:**
- Replace `123.45.67.89` with your server's public IP
- Cloudflare proxy (orange cloud) is optional but recommended for DDoS protection
- TTL can be set to Auto or 3600 seconds

### Verify DNS

```bash
# Check DNS resolution
nslookup kura.tillmaessen.de
nslookup auth.tillmaessen.de

# Should both return your server IP
```

---

## Testing

### 1. Health Checks

```bash
# Test KOauth
curl https://auth.tillmaessen.de/health
# Expected: {"status":"healthy"}

# Test KURA Notes API
curl https://kura.tillmaessen.de/api/health
# Expected: {"status":"healthy","services":{...}}
```

### 2. Web Access Test

1. **Open browser:** `https://kura.tillmaessen.de`
2. **Should redirect to:** `https://auth.tillmaessen.de/login`
3. **Sign up** with email or OAuth provider
4. **Should redirect back** to KURA Notes dashboard

### 3. Authentication Flow Test

```bash
# 1. Try accessing protected endpoint without auth (should fail)
curl -i https://kura.tillmaessen.de/api/me
# Expected: 302 redirect to login

# 2. Log in via web interface
# 3. Check cookies are set (in browser DevTools → Application → Cookies)
# 4. Try accessing protected endpoint (should work)
```

### 4. OAuth Provider Test

1. Click "Sign in with Google" or "Sign in with GitHub"
2. Authorize the app
3. Should redirect back to KURA Notes and be logged in
4. Check `/api/me` to verify user data

---

## Troubleshooting

### Issue: "Cannot connect to KOauth"

**Symptoms:** KURA Notes logs show connection errors to KOauth

**Solutions:**

1. **Check KOauth is running:**
   ```bash
   docker compose ps koauth
   # Should show "healthy"
   ```

2. **Check KOauth logs:**
   ```bash
   docker compose logs koauth
   ```

3. **Verify KOAUTH_URL in API container:**
   ```bash
   docker compose exec api env | grep KOAUTH_URL
   # Should show: KOAUTH_URL=http://koauth:3000
   ```

4. **Test internal connection:**
   ```bash
   docker compose exec api curl http://koauth:3000/health
   # Should return: {"status":"healthy"}
   ```

### Issue: "PostgreSQL connection error"

**Symptoms:** KOauth logs show database connection failures

**Solutions:**

1. **Check PostgreSQL is running:**
   ```bash
   docker compose ps postgres
   ```

2. **Check database credentials:**
   ```bash
   docker compose exec postgres psql -U koauth -d koauth
   # Should connect without error
   ```

3. **Recreate database (if needed):**
   ```bash
   docker compose down postgres
   docker volume rm kura-postgres-data
   docker compose up -d postgres
   ```

### Issue: "OAuth redirect mismatch"

**Symptoms:** After OAuth login, error "redirect_uri_mismatch"

**Solutions:**

1. **Check OAuth app settings:**
   - Google: Authorized redirect URIs must include `https://auth.tillmaessen.de/auth/google/callback`
   - GitHub: Authorization callback URL must be `https://auth.tillmaessen.de/auth/github/callback`

2. **Check KOAUTH_BASE_URL:**
   ```bash
   docker compose exec koauth env | grep KOAUTH_BASE_URL
   # Should be: https://auth.tillmaessen.de
   ```

3. **Restart KOauth after changing config:**
   ```bash
   docker compose restart koauth
   ```

### Issue: "Session expired immediately"

**Symptoms:** Login works but session expires after first request

**Solutions:**

1. **Check KOAUTH_SESSION_SECRET is set:**
   ```bash
   docker compose exec koauth env | grep KOAUTH_SESSION_SECRET
   ```

2. **Verify cookies are being set:**
   - Open browser DevTools → Application → Cookies
   - Should see `koauth_session` cookie with HttpOnly and Secure flags

3. **Check KOAUTH_ALLOWED_CALLBACKS includes your domain:**
   ```bash
   docker compose exec koauth env | grep KOAUTH_ALLOWED_CALLBACKS
   # Should include: https://kura.tillmaessen.de
   ```

### Issue: "SSL certificate error"

**Symptoms:** Browser shows "Not secure" or certificate warnings

**Solutions:**

1. **Check Caddy logs:**
   ```bash
   sudo journalctl -u caddy -f
   ```

2. **Verify DNS is correct:**
   ```bash
   nslookup kura.tillmaessen.de
   nslookup auth.tillmaessen.de
   ```

3. **Test Let's Encrypt:**
   ```bash
   # Caddy will automatically retry
   sudo systemctl restart caddy
   ```

4. **Check firewall allows ports 80 and 443:**
   ```bash
   sudo ufw status
   # Should show: 80/tcp ALLOW, 443/tcp ALLOW
   ```

---

## Next Steps

After successful setup:

1. ✅ **Create your first user account** via web interface
2. ✅ **Test content capture** (create a note)
3. ✅ **Test search** functionality
4. ✅ **Generate API key** for iOS Shortcut (Settings → API Keys)
5. ✅ **Configure backups** (see `docs/backup.md`)
6. ✅ **Set up monitoring** (optional)

---

## Additional Resources

- **KOauth Repository:** https://github.com/TillMatthis/KOauth
- **API Documentation:** `docs/API-DOCS.md`
- **Deployment Guide:** `docs/deployment.md`
- **Backup Guide:** `docs/backup.md`

---

## Support

For issues or questions:
- Check this guide first
- Review KOauth logs: `docker compose logs koauth`
- Review API logs: `docker compose logs api`
- Create GitHub issue with logs and `.env` (sanitized)

---

**Last Updated:** 2025-11-27
**Version:** 1.0.0
