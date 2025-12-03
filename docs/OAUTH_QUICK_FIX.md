# OAuth Integration Quick Fix Guide

**Problem:** `{"error": "Invalid token"}` after OAuth callback

---

## TL;DR - Most Likely Fixes

### Fix 1: JWKS Endpoint Blocked (403 Error)

**Test:**
```bash
curl https://auth.tillmaessen.de/.well-known/jwks.json
```

**If you get 403, fix your reverse proxy:**

**Nginx:**
```nginx
# Add to your auth.tillmaessen.de configuration
location ~ /\.well-known/ {
    allow all;
    proxy_pass http://koauth:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

**Caddy:**
```caddyfile
# Should work by default
auth.tillmaessen.de {
    reverse_proxy koauth:3000
}
```

---

### Fix 2: Missing Client Secret

**Generate secret:**
```bash
openssl rand -hex 32
```

**Update Kura Notes `.env`:**
```bash
OAUTH_CLIENT_SECRET=your-generated-secret-here
```

**Update KOauth database:**
```sql
UPDATE oauth_clients
SET client_secret = 'your-generated-secret-here'
WHERE client_id = 'kura-notes';
```

**Restart:**
```bash
docker restart kura-notes-api
```

---

### Fix 3: Issuer Mismatch

**Update KOauth `.env`:**
```bash
JWT_ISSUER=https://auth.tillmaessen.de
JWT_AUDIENCE=kura-notes,komcp
```

**Update Kura Notes `.env` (if needed):**
```bash
KOAUTH_URL=https://auth.tillmaessen.de
# KOAUTH_ISSUER not needed if it matches KOAUTH_URL
```

**Restart:**
```bash
docker restart koauth
```

---

## Step-by-Step Diagnostic

### Step 1: Run Diagnostic Script

```bash
cd /home/user/kura-notes
./scripts/diagnose-oauth.sh
```

This will test:
- JWKS endpoint accessibility
- Environment variables
- OAuth endpoints
- CORS configuration
- SSL certificates

---

### Step 2: Check Logs

**Enable debug logging in Kura Notes:**
```bash
# In .env
LOG_LEVEL=debug

# Restart
docker restart kura-notes-api

# Watch logs
docker logs -f kura-notes-api | grep -E "JWT|oauth|token"
```

**Look for these errors:**

| Log Message | Cause | Fix |
|------------|-------|-----|
| `JWT claim validation failed` | Issuer/audience mismatch | Set JWT_ISSUER in KOauth |
| `JWT signature verification failed` | Cannot verify signature | Check JWKS accessibility |
| `No matching key in JWKS` | Key ID not found | Verify key rotation |
| `Failed to fetch JWKS` | Network/403 error | Fix reverse proxy |

---

### Step 3: Decode JWT Token (Advanced)

Add this temporary debug code to `src/api/routes/oauth.ts` after line 188:

```typescript
// TEMPORARY DEBUG - Remove after fixing
const parts = tokens.access_token.split('.');
if (parts.length === 3) {
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    logger.info('JWT Debug', {
      header,
      payload,
      expectedIssuer: config.koauthIssuer || config.koauthUrl,
      expectedAudience: 'kura-notes'
    });
  } catch (e) {
    logger.error('JWT decode failed', { error: e });
  }
}
```

**Check the output:**
- Does `payload.iss` match `expectedIssuer`?
- Does `payload.aud` include `"kura-notes"`?
- Are `sub`, `email`, `type`, `jti` present?

---

## Configuration Checklist

### KOauth Server (.env)

```bash
# Critical
JWT_ISSUER=https://auth.tillmaessen.de
JWT_AUDIENCE=kura-notes,komcp

# Optional (recommended for production)
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----

# CORS
CORS_ORIGIN=*
```

### Kura Notes (.env)

```bash
# Critical
KOAUTH_URL=https://auth.tillmaessen.de
OAUTH_CLIENT_ID=kura-notes
OAUTH_CLIENT_SECRET=<your-secret-from-openssl-rand>
OAUTH_REDIRECT_URI=https://kura.tillmaessen.de/oauth/callback

# Optional
LOG_LEVEL=debug  # For troubleshooting
```

### KOauth Database

```sql
-- Verify OAuth client exists
SELECT client_id, redirect_uri, created_at
FROM oauth_clients
WHERE client_id = 'kura-notes';

-- If not found, create it
INSERT INTO oauth_clients (client_id, client_secret, redirect_uri)
VALUES (
  'kura-notes',
  '<your-secret-from-openssl-rand>',
  'https://kura.tillmaessen.de/oauth/callback'
);
```

---

## Verification

After applying fixes:

```bash
# 1. Test JWKS endpoint
curl https://auth.tillmaessen.de/.well-known/jwks.json
# Should return: {"keys":[{...}]}

# 2. Restart services
docker restart koauth kura-notes-api

# 3. Check logs
docker logs koauth --tail 20
docker logs kura-notes-api --tail 20

# 4. Test OAuth flow
# Visit: https://kura.tillmaessen.de/oauth/authorize
# Login via Google/GitHub
# Should redirect back and login successfully

# 5. Verify session
# After login, you should be authenticated
```

---

## Common Error Messages

### Error: `{"error": "Invalid token"}`

**Causes:**
1. JWKS endpoint returns 403
2. Issuer mismatch
3. Audience mismatch
4. Signature verification failed
5. Missing required claims

**Fix:** Run diagnostic script and check logs

---

### Error: `{"error": "invalid_client"}`

**Cause:** Client secret is incorrect or missing

**Fix:**
1. Generate secret: `openssl rand -hex 32`
2. Set in Kura `.env`: `OAUTH_CLIENT_SECRET=...`
3. Update KOauth database
4. Restart Kura

---

### Error: `Failed to fetch JWKS`

**Cause:** Network issue or reverse proxy blocking

**Fix:**
1. Test: `curl https://auth.tillmaessen.de/.well-known/jwks.json`
2. Check reverse proxy logs
3. Verify CORS_ORIGIN in KOauth
4. Check firewall rules

---

## Key Rotation Handling

When KOauth restarts with auto-generated keys:

1. ✅ **Kura automatically fetches new JWKS**
   - JWKS client has 1-hour cache
   - Auto-refreshes on verification failure
   - Matches keys by `kid` (key ID)

2. ⚠️ **Old tokens become invalid**
   - Signature verification fails
   - Users must re-authenticate

3. ✅ **New tokens work immediately**
   - New `kid` in JWT header
   - Kura fetches matching key from JWKS

**To avoid invalidation on restart:**

Use persistent keys in KOauth `.env`:

```bash
# Generate keys once
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Convert to single-line format (replace newlines with \n)
PRIVATE_KEY=$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem)
PUBLIC_KEY=$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.pem)

# Add to KOauth .env
JWT_PRIVATE_KEY="$PRIVATE_KEY"
JWT_PUBLIC_KEY="$PUBLIC_KEY"
```

---

## Need More Help?

1. **Full diagnostic report:** `docs/OAUTH_DIAGNOSTIC_REPORT.md`
2. **Run diagnostic script:** `./scripts/diagnose-oauth.sh`
3. **Enable debug logging:** `LOG_LEVEL=debug` in `.env`
4. **Check KOauth docs:** https://github.com/TillMatthis/KOauth

---

**Generated:** 2025-12-03
