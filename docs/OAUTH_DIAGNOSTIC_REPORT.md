# OAuth Integration Diagnostic Report

**Date:** 2025-12-03
**Issue:** `{"error": "Invalid token"}` during OAuth callback
**Systems:** Kura Notes ↔ KOauth OAuth Server

---

## Executive Summary

The "Invalid token" error occurs during OAuth callback when JWT verification fails at `src/api/routes/oauth.ts:202`. Based on comprehensive analysis of both codebases, I've identified **5 critical issues** that need to be resolved:

1. **🚨 JWKS Endpoint Returns 403** - Blocking JWT verification entirely
2. **🚨 Missing OAuth Client Secret** - Required for token exchange
3. **⚠️ Potential Issuer Mismatch** - KOauth default vs production URL
4. **⚠️ Reverse Proxy Configuration** - Blocking `.well-known` paths
5. **ℹ️ Limited Error Logging** - Difficult to diagnose exact failure

---

## Current Configuration Analysis

### Kura Notes Configuration

**File:** `.env.example`

```bash
# OAuth Server Configuration
KOAUTH_URL=https://auth.tillmaessen.de
# KOAUTH_ISSUER=https://auth.tillmaessen.de  # Commented out (uses KOAUTH_URL)
# KOAUTH_JWKS_URL=...                         # Not set (uses default)

# OAuth Client Configuration
OAUTH_CLIENT_ID=kura-notes
OAUTH_CLIENT_SECRET=                          # ❌ EMPTY - CRITICAL
OAUTH_REDIRECT_URI=https://kura.tillmaessen.de/oauth/callback
```

**JWT Verification Settings:**
- **Expected Issuer:** `https://auth.tillmaessen.de` (no trailing slash)
- **Expected Audience:** `kura-notes` (hardcoded)
- **Algorithm:** RS256
- **JWKS URL:** `https://auth.tillmaessen.de/.well-known/jwks.json`
- **JWKS Cache:** 1 hour (auto-refresh on verification failure)

### KOauth Server Configuration

**Expected Environment Variables:**

```bash
# JWT Configuration
JWT_ISSUER=https://auth.tillmaessen.de        # ⚠️ Default is http://localhost:3000
JWT_AUDIENCE=kura-notes,komcp                 # ✅ Includes kura-notes

# CORS Configuration
CORS_ORIGIN=*                                  # Or specific domain

# OAuth Client Registration
# Client must be registered in database:
# - client_id: kura-notes
# - client_secret: (secure random string)
# - redirect_uri: https://kura.tillmaessen.de/oauth/callback
```

**JWT Token Structure:**

```typescript
{
  "sub": "user-id",              // User ID
  "email": "user@example.com",   // User email
  "iss": "https://auth.tillmaessen.de",  // Issuer (from JWT_ISSUER)
  "aud": ["kura-notes", "komcp"],        // Audience (from JWT_AUDIENCE)
  "type": "access_token",        // Token type
  "jti": "unique-token-id",      // JWT ID
  "iat": 1733184000,             // Issued at
  "exp": 1733185800              // Expires in 15 minutes
}
```

---

## Root Cause Analysis

### Issue 1: JWKS Endpoint Returns 403 (CRITICAL)

**Symptom:**
```bash
$ curl https://auth.tillmaessen.de/.well-known/jwks.json
HTTP/1.1 403 Forbidden
```

**Impact:** JWT verification **cannot proceed** without access to public keys

**Possible Causes:**

1. **Reverse Proxy Blocking** (Most Likely)
   - Nginx/Caddy/Cloudflare may block `.well-known` paths
   - Some proxies have default rules blocking hidden directories

2. **CORS Misconfiguration**
   - KOauth `CORS_ORIGIN` not set to `*` or kura-notes domain
   - Pre-flight OPTIONS requests failing

3. **Rate Limiting**
   - Exceeding 100 requests/minute (unlikely to be 403)

4. **Infrastructure Firewall**
   - Cloud provider WAF rules
   - DDoS protection blocking automated requests

**Verification Steps:**

```bash
# Test 1: Direct curl (from server)
curl -v https://auth.tillmaessen.de/.well-known/jwks.json

# Test 2: Check response headers
curl -I https://auth.tillmaessen.de/.well-known/jwks.json

# Test 3: Test with different User-Agent
curl -H "User-Agent: Mozilla/5.0" https://auth.tillmaessen.de/.well-known/jwks.json

# Test 4: Check CORS
curl -H "Origin: https://kura.tillmaessen.de" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://auth.tillmaessen.de/.well-known/jwks.json

# Test 5: Check from within Docker network
docker exec kura-notes-api curl http://koauth:3000/.well-known/jwks.json
```

**Expected Response:**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "some-key-id",
      "n": "base64url-encoded-modulus",
      "e": "AQAB"
    }
  ]
}
```

**Fix Required:**

- If using Nginx, add:
  ```nginx
  location ~ /\.well-known/ {
    allow all;
  }
  ```

- If using Caddy, it should work by default

- Verify KOauth `CORS_ORIGIN` environment variable

---

### Issue 2: Missing OAuth Client Secret (CRITICAL)

**Symptom:**
```bash
OAUTH_CLIENT_SECRET=    # Empty in .env.example
```

**Impact:** Token exchange request will be rejected with `401 Unauthorized`

**Error Flow:**

1. User completes authorization → Kura receives code
2. Kura POST to `/oauth/token` with empty client_secret
3. KOauth validates credentials using timing-safe comparison
4. Validation fails → Returns `401 Invalid client credentials`
5. Kura cannot proceed to token verification

**Fix Required:**

```bash
# Generate secure client secret (32-64 characters recommended)
openssl rand -hex 32

# Set in .env
OAUTH_CLIENT_SECRET=<generated-secret>

# Must match the client secret in KOauth database
```

**Verification:**

```bash
# In KOauth database
SELECT client_id, client_secret, redirect_uri
FROM oauth_clients
WHERE client_id = 'kura-notes';
```

---

### Issue 3: Issuer Mismatch (LIKELY)

**Symptom:** JWT claim validation fails with issuer mismatch

**Current Behavior:**

| System | Issuer Value | Source |
|--------|-------------|--------|
| KOauth (Default) | `http://localhost:3000` | `JWT_ISSUER` env var default |
| KOauth (Production) | ??? | Unknown if overridden |
| Kura Notes (Expected) | `https://auth.tillmaessen.de` | `KOAUTH_URL` or `KOAUTH_ISSUER` |

**Problem:**

If KOauth's `JWT_ISSUER` is not set to production URL, tokens will contain:
```json
{
  "iss": "http://localhost:3000"  // ❌ Doesn't match
}
```

But Kura expects:
```typescript
issuer: 'https://auth.tillmaessen.de'  // From config
```

**Issuer Validation Code** (`src/lib/jwt-verifier.ts:52-57`):

```typescript
const expectedIssuer = config.koauthIssuer || config.koauthUrl;

// Remove trailing slash for comparison
const normalizedIssuer = expectedIssuer.endsWith('/')
  ? expectedIssuer.slice(0, -1)
  : expectedIssuer;
```

**Possible Variations:**

- KOauth sends: `https://auth.tillmaessen.de/` (with trailing slash)
- Kura expects: `https://auth.tillmaessen.de` (without)
- **Result:** Kura normalizes it, so this should work ✅

**Fix Required:**

Set in KOauth `.env`:
```bash
JWT_ISSUER=https://auth.tillmaessen.de
```

---

### Issue 4: Audience Validation

**Current Configuration:**

| System | Audience Value |
|--------|---------------|
| KOauth | `kura-notes,komcp` (default) → `["kura-notes", "komcp"]` |
| Kura Notes | `kura-notes` (hardcoded requirement) |

**Validation Logic** (`src/lib/jwt-verifier.ts:66`):

```typescript
audience: 'kura-notes',  // Must include this value
```

**Status:** ✅ Should work (KOauth includes `kura-notes` in audience)

**Verification:**

Ensure KOauth `JWT_AUDIENCE` includes `kura-notes`:
```bash
JWT_AUDIENCE=kura-notes,komcp
```

---

### Issue 5: Limited Error Logging

**Current Error Response** (`src/api/routes/oauth.ts:202`):

```typescript
if (!verifiedUser) {
  logger.error('Failed to verify access token');
  return reply.status(400).send({ error: 'Invalid token' });
}
```

**Problem:** Generic error doesn't reveal root cause:
- Issuer mismatch?
- Audience mismatch?
- Signature verification failed?
- Missing claims?
- JWKS fetch failed?

**JWT Verifier Logging** (`src/lib/jwt-verifier.ts:128-139`):

```typescript
if (errorName === 'JWTClaimValidationFailed') {
  logger.warn('JWT claim validation failed', { error: errorMessage });
} else if (errorName === 'JWSSignatureVerificationFailed') {
  logger.warn('JWT signature verification failed', { error: errorMessage });
} else if (errorName === 'JWKSNoMatchingKey') {
  logger.warn('No matching key in JWKS', { error: errorMessage });
}
```

**Good news:** Detailed errors are logged, but at `warn` level

**Action Required:**

1. Set log level to `debug` temporarily:
   ```bash
   LOG_LEVEL=debug
   ```

2. Review logs during OAuth callback:
   ```bash
   docker logs kura-notes-api --tail 100 -f | grep -i jwt
   ```

---

## OAuth Flow Breakdown

### Step-by-Step Analysis

#### Step 1: Authorization Request ✅

```http
GET https://auth.tillmaessen.de/oauth/authorize?
  response_type=code&
  client_id=kura-notes&
  redirect_uri=https://kura.tillmaessen.de/oauth/callback&
  scope=openid%20profile%20email&
  state=random-32-char-string
```

**Status:** Working (user sees login page)

---

#### Step 2: Authorization Grant ✅

User logs in → KOauth redirects:

```http
HTTP/1.1 302 Found
Location: https://kura.tillmaessen.de/oauth/callback?
  code=authorization-code&
  state=random-32-char-string
```

**Status:** Working (code is received)

---

#### Step 3: Token Exchange ⚠️

**Request** (`src/api/routes/oauth.ts:164-174`):

```http
POST https://auth.tillmaessen.de/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "authorization-code",
  "redirect_uri": "https://kura.tillmaessen.de/oauth/callback",
  "client_id": "kura-notes",
  "client_secret": ""   ❌ EMPTY - WILL FAIL
}
```

**Expected Response (Success):**

```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Expected Response (Failure - Missing Secret):**

```json
{
  "error": "invalid_client",
  "error_description": "Invalid client credentials"
}
```

**Status:** Likely failing due to empty client secret

---

#### Step 4: JWT Verification ❌

**Code** (`src/api/routes/oauth.ts:196-203`):

```typescript
const verifiedUser = await verifyJWT(tokens.access_token);

if (!verifiedUser) {
  logger.error('Failed to verify access token');
  return reply.status(400).send({ error: 'Invalid token' });  // ← YOU ARE HERE
}
```

**Verification Process** (`src/lib/jwt-verifier.ts:49-148`):

1. Fetch JWKS from `https://auth.tillmaessen.de/.well-known/jwks.json`
   - **❌ Returns 403 - Cannot fetch keys**

2. Decode JWT header to get `kid` (key ID)

3. Find matching key in JWKS by `kid`

4. Verify signature using RSA public key

5. Validate claims:
   - `iss` must equal `https://auth.tillmaessen.de`
   - `aud` must include `kura-notes`
   - `exp` must be in future
   - `sub`, `email`, `type`, `jti` must be present

**Status:** ❌ Failing - Cannot fetch JWKS (403 error)

---

## Diagnostic Testing Plan

### Test 1: Verify JWKS Accessibility

```bash
# From server/container
curl -v https://auth.tillmaessen.de/.well-known/jwks.json

# Expected: 200 OK with JWKS JSON
# Actual: 403 Forbidden ← ISSUE

# Check response headers
curl -I https://auth.tillmaessen.de/.well-known/jwks.json

# Test from inside Docker network (if applicable)
docker exec -it kura-notes-api curl http://koauth:3000/.well-known/jwks.json
```

**Fix if 403:**
- Check reverse proxy configuration (Nginx/Caddy)
- Verify `CORS_ORIGIN` in KOauth
- Check cloud firewall rules

---

### Test 2: Verify OAuth Client Registration

```bash
# On KOauth server
docker exec -it koauth psql -U koauth -d koauth -c \
  "SELECT client_id, redirect_uri, created_at FROM oauth_clients WHERE client_id = 'kura-notes';"

# Expected output:
#  client_id  |                redirect_uri                 |     created_at
# ------------+--------------------------------------------+---------------------
#  kura-notes | https://kura.tillmaessen.de/oauth/callback | 2025-11-15 10:30:00
```

**If not found:**

```sql
-- Register OAuth client
INSERT INTO oauth_clients (client_id, client_secret, redirect_uri)
VALUES (
  'kura-notes',
  'your-generated-secret-here',  -- Must match Kura's OAUTH_CLIENT_SECRET
  'https://kura.tillmaessen.de/oauth/callback'
);
```

---

### Test 3: Verify KOauth JWT Configuration

```bash
# On KOauth server
docker exec koauth env | grep -E "JWT_ISSUER|JWT_AUDIENCE"

# Expected:
JWT_ISSUER=https://auth.tillmaessen.de
JWT_AUDIENCE=kura-notes,komcp
```

**If not set:**

```bash
# Add to KOauth .env
JWT_ISSUER=https://auth.tillmaessen.de
JWT_AUDIENCE=kura-notes,komcp

# Restart KOauth
docker restart koauth
```

---

### Test 4: Manual Token Generation Test

Create test script to validate JWT generation:

```bash
# On KOauth server - check logs during token generation
docker logs koauth --tail 100 -f | grep -E "token|jwt|jwks"

# Trigger OAuth flow and watch logs
```

---

### Test 5: Decode JWT Token (Manual Inspection)

Add temporary logging in `src/api/routes/oauth.ts` after line 188:

```typescript
// TEMPORARY DEBUG CODE
const parts = tokens.access_token.split('.');
if (parts.length === 3) {
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    logger.info('JWT Debug Info', {
      header,
      payload,
      expectedIssuer: config.koauthIssuer || config.koauthUrl,
      expectedAudience: 'kura-notes'
    });
  } catch (e) {
    logger.error('Failed to decode JWT for debugging', { error: e });
  }
}
// END TEMPORARY DEBUG CODE
```

**Expected Output:**

```json
{
  "header": {
    "alg": "RS256",
    "kid": "some-key-id",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-id",
    "email": "user@example.com",
    "iss": "https://auth.tillmaessen.de",  // ← Must match KOAUTH_URL
    "aud": ["kura-notes", "komcp"],        // ← Must include "kura-notes"
    "type": "access_token",
    "jti": "token-id",
    "iat": 1733184000,
    "exp": 1733185800
  },
  "expectedIssuer": "https://auth.tillmaessen.de",
  "expectedAudience": "kura-notes"
}
```

**Check for mismatches:**
- `payload.iss` ≠ `expectedIssuer` → Issuer mismatch
- `payload.aud` doesn't include `expectedAudience` → Audience mismatch
- Missing `type`, `jti`, `sub`, or `email` → Missing claims

---

## Action Plan (Priority Order)

### Priority 1: Fix JWKS Endpoint (CRITICAL)

**Goal:** Make `https://auth.tillmaessen.de/.well-known/jwks.json` accessible

**Steps:**

1. Test endpoint accessibility:
   ```bash
   curl -v https://auth.tillmaessen.de/.well-known/jwks.json
   ```

2. If using Nginx reverse proxy:
   ```nginx
   # In your site configuration
   location ~ /\.well-known/ {
       allow all;
       proxy_pass http://koauth:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

3. If using Caddy, verify configuration:
   ```caddyfile
   auth.tillmaessen.de {
       reverse_proxy koauth:3000
   }
   ```

4. Verify CORS in KOauth:
   ```bash
   # KOauth .env
   CORS_ORIGIN=*
   ```

5. Restart services and test:
   ```bash
   docker restart koauth nginx
   curl https://auth.tillmaessen.de/.well-known/jwks.json
   ```

---

### Priority 2: Set OAuth Client Secret (CRITICAL)

**Goal:** Configure matching client secret in both systems

**Steps:**

1. Generate secure secret:
   ```bash
   openssl rand -hex 32
   # Output: a1b2c3d4e5f6...
   ```

2. Update Kura Notes `.env`:
   ```bash
   OAUTH_CLIENT_SECRET=a1b2c3d4e5f6...
   ```

3. Register or update client in KOauth database:
   ```sql
   -- Update existing client
   UPDATE oauth_clients
   SET client_secret = 'a1b2c3d4e5f6...'
   WHERE client_id = 'kura-notes';

   -- Or insert if not exists
   INSERT INTO oauth_clients (client_id, client_secret, redirect_uri)
   VALUES (
     'kura-notes',
     'a1b2c3d4e5f6...',
     'https://kura.tillmaessen.de/oauth/callback'
   )
   ON CONFLICT (client_id) DO UPDATE
   SET client_secret = EXCLUDED.client_secret;
   ```

4. Restart Kura Notes:
   ```bash
   docker restart kura-notes-api
   ```

---

### Priority 3: Verify JWT Issuer Configuration (HIGH)

**Goal:** Ensure issuer matches between systems

**Steps:**

1. Check KOauth configuration:
   ```bash
   docker exec koauth env | grep JWT_ISSUER
   ```

2. If not set or incorrect, update KOauth `.env`:
   ```bash
   JWT_ISSUER=https://auth.tillmaessen.de
   ```

3. Verify Kura Notes configuration:
   ```bash
   grep -E "KOAUTH_URL|KOAUTH_ISSUER" .env

   # Should show:
   KOAUTH_URL=https://auth.tillmaessen.de
   # KOAUTH_ISSUER not needed if it matches KOAUTH_URL
   ```

4. Restart KOauth:
   ```bash
   docker restart koauth
   ```

5. Test token generation and verify issuer claim

---

### Priority 4: Verify JWT Audience Configuration (MEDIUM)

**Goal:** Ensure audience includes `kura-notes`

**Steps:**

1. Check KOauth configuration:
   ```bash
   docker exec koauth env | grep JWT_AUDIENCE
   ```

2. If not set, update KOauth `.env`:
   ```bash
   JWT_AUDIENCE=kura-notes,komcp
   ```

3. Restart KOauth:
   ```bash
   docker restart koauth
   ```

---

### Priority 5: Enable Debug Logging (LOW)

**Goal:** Get detailed error messages for troubleshooting

**Steps:**

1. Update Kura Notes `.env`:
   ```bash
   LOG_LEVEL=debug
   ```

2. Restart Kura Notes:
   ```bash
   docker restart kura-notes-api
   ```

3. Monitor logs during OAuth flow:
   ```bash
   docker logs -f kura-notes-api | grep -E "JWT|oauth|token"
   ```

4. Look for specific errors:
   - `JWT claim validation failed` → Issuer/audience mismatch
   - `JWT signature verification failed` → JWKS/key issue
   - `No matching key in JWKS` → Key ID mismatch

---

## Configuration Checklist

### KOauth Server

```bash
# Required
JWT_ISSUER=https://auth.tillmaessen.de
JWT_AUDIENCE=kura-notes,komcp
CORS_ORIGIN=*

# Database - OAuth client registration
# Run SQL to verify/create:
SELECT * FROM oauth_clients WHERE client_id = 'kura-notes';
```

### Kura Notes

```bash
# Required
KOAUTH_URL=https://auth.tillmaessen.de
OAUTH_CLIENT_ID=kura-notes
OAUTH_CLIENT_SECRET=<your-generated-secret>
OAUTH_REDIRECT_URI=https://kura.tillmaessen.de/oauth/callback

# Optional (for debugging)
LOG_LEVEL=debug
KOAUTH_ISSUER=https://auth.tillmaessen.de  # Only if different from KOAUTH_URL
```

### Infrastructure

- [ ] JWKS endpoint accessible: `curl https://auth.tillmaessen.de/.well-known/jwks.json`
- [ ] Reverse proxy allows `.well-known` paths
- [ ] CORS configured to allow cross-origin requests
- [ ] No rate limiting or WAF blocking JWKS requests
- [ ] SSL certificates valid

---

## Expected Behavior After Fixes

### Normal Flow (Success)

1. User clicks "Login with OAuth"
2. Redirected to KOauth login page
3. User authenticates (Google/GitHub/Email)
4. Redirected back to Kura with authorization code
5. Kura exchanges code for access token ✅
6. Kura fetches JWKS from KOauth ✅
7. Kura verifies JWT signature using RSA public key ✅
8. Kura validates JWT claims (issuer, audience, expiration) ✅
9. Kura stores access token in session
10. User is logged in and redirected to dashboard ✅

### Key Rotation Flow

When KOauth restarts with auto-generated keys:

1. New RSA key pair generated with new `kid`
2. JWKS endpoint updated with new public key
3. Old tokens become invalid (signature verification fails)
4. Kura fetches new JWKS (cache expires or verification fails)
5. New tokens are issued with new `kid`
6. Kura verifies new tokens successfully
7. **Users must re-authenticate** (old sessions invalid)

**Recommendation:** Use persistent keys via environment variables:

```bash
# KOauth .env
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
```

---

## Verification Steps

After implementing fixes:

```bash
# 1. Verify JWKS endpoint
curl https://auth.tillmaessen.de/.well-known/jwks.json
# Expected: 200 OK with JSON

# 2. Check KOauth logs
docker logs koauth --tail 50

# 3. Check Kura logs
docker logs kura-notes-api --tail 50

# 4. Test OAuth flow
# Visit: https://kura.tillmaessen.de/oauth/authorize
# Complete authentication
# Verify successful login

# 5. Check session
# Should have access token stored
```

---

## Additional Resources

### File References

| Component | File Path | Lines |
|-----------|-----------|-------|
| OAuth Callback Handler | `/src/api/routes/oauth.ts` | 118-243 |
| JWT Verifier | `/src/lib/jwt-verifier.ts` | 49-148 |
| JWKS Client | `/src/lib/jwks-client.ts` | 1-74 |
| Configuration | `/src/config/config.ts` | 152-154 |
| Auth Middleware | `/src/api/middleware/auth.ts` | 1-281 |

### Related Documentation

- KOauth Repository: https://github.com/TillMatthis/KOauth
- JWT Verification Docs: `/docs/JWT_VERIFICATION.md`
- OAuth Integration: `/docs/OAUTH_INTEGRATION.md`

### Error Code Reference

| Error | Cause | Solution |
|-------|-------|----------|
| 403 JWKS | Reverse proxy blocking | Fix Nginx/Caddy config |
| 401 Token Exchange | Invalid client credentials | Set OAUTH_CLIENT_SECRET |
| 400 Invalid Token | JWT verification failed | Check issuer/audience/JWKS |
| JWTClaimValidationFailed | Issuer/audience mismatch | Verify JWT_ISSUER config |
| JWSSignatureVerificationFailed | Cannot verify signature | Check JWKS accessibility |
| JWKSNoMatchingKey | Key ID not found in JWKS | Verify key rotation handling |

---

## Summary

**Root Causes:**

1. **JWKS endpoint blocked (403)** - Prevents all JWT verification
2. **Missing OAuth client secret** - Prevents token exchange
3. **Potential issuer mismatch** - KOauth may not be configured for production

**Quick Fix (Most Likely):**

```bash
# 1. Fix JWKS endpoint access (reverse proxy configuration)
# 2. Set OAUTH_CLIENT_SECRET in Kura .env
# 3. Set JWT_ISSUER in KOauth .env
# 4. Restart both services
```

**Next Steps:**

1. Test JWKS endpoint accessibility
2. Review reverse proxy configuration
3. Verify OAuth client registration in database
4. Set environment variables
5. Enable debug logging
6. Test OAuth flow
7. Review logs for specific error messages

---

**Generated:** 2025-12-03
**Status:** Awaiting fixes and testing
