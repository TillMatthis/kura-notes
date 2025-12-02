# JWT Verification with RS256

## Overview

Kura-Notes now implements **secure JWT verification** using RS256 asymmetric signatures. This replaces the previous insecure implementation that decoded JWTs without signature verification.

## Security Improvement

### Before (Insecure) ❌

- JWTs were decoded without signature verification
- Only checked expiration time
- Anyone could create fake tokens with arbitrary user IDs
- Comment stated: "Decode JWT without verification (KOauth already verified it)"
- **This was a critical security vulnerability**

### After (Secure) ✅

- JWT signatures are verified using RS256 and KOauth's public key
- Public keys fetched from JWKS endpoint (`/.well-known/jwks.json`)
- All claims validated: `iss`, `aud`, `exp`, `sub`, `type`
- Invalid/tampered JWTs are rejected with 401
- Key rotation supported (multiple keys in JWKS)
- Automatic key refresh on verification failure

## Architecture

### Components

1. **JWKS Client** (`src/lib/jwks-client.ts`)
   - Fetches RSA public keys from `{KOAUTH_URL}/.well-known/jwks.json`
   - Caches keys for 1 hour
   - Handles key rotation (multiple keys)
   - Auto-refreshes on verification failure

2. **JWT Verifier** (`src/lib/jwt-verifier.ts`)
   - Verifies RS256 signatures using `jose` library
   - Validates all required claims
   - Returns verified user information
   - Detailed error logging

3. **Authentication Middleware** (`src/api/middleware/auth.ts`)
   - Updated to use secure JWT verification
   - Verifies access tokens from OAuth sessions
   - Verifies JWT-based API keys

4. **API Key Validation** (`src/lib/koauth-client.ts`)
   - Detects JWT format (starts with `eyJ`)
   - Verifies JWT-based API keys with signature validation
   - Falls back to legacy validation for non-JWT keys

## JWT Claims Validation

All JWTs must include the following claims:

| Claim | Required | Validation | Description |
|-------|----------|------------|-------------|
| `iss` | ✅ Yes | Must match `KOAUTH_ISSUER` or `KOAUTH_URL` | Token issuer (KOauth URL) |
| `aud` | ✅ Yes | Must include `"kura-notes"` | Intended audience |
| `exp` | ✅ Yes | Must be in the future | Expiration time (Unix timestamp) |
| `sub` | ✅ Yes | Must be present | User ID |
| `email` | ✅ Yes | Must be present | User email address |
| `type` | ✅ Yes | Must be `"access_token"` or `"api_key"` | Token type |
| `jti` | ✅ Yes | Must be present | Unique token identifier |
| `iat` | ❌ No | Not validated | Issued at time |

**Clock Skew Tolerance:** 30 seconds (to handle minor clock differences)

## API Key Support

API keys can now be in two formats:

### 1. JWT-Based API Keys (New)

- Format: `eyJ...` (standard JWT format)
- Validated with RS256 signature verification
- Must have `type: "api_key"` claim
- All standard JWT claims validated

**Example:**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  https://kura.example.com/api/notes
```

### 2. Legacy Opaque API Keys

- Format: Random string (not JWT)
- Validated via KOauth's `/api/validate-key` endpoint
- Backwards compatible with existing keys

**Example:**
```bash
curl -H "Authorization: Bearer abc123xyz456..." \
  https://kura.example.com/api/notes
```

The system automatically detects which format is used.

## Configuration

### Environment Variables

#### Required

```bash
# KOauth server URL
KOAUTH_URL=https://auth.tillmaessen.de
```

#### Optional (Advanced)

```bash
# JWT issuer (defaults to KOAUTH_URL if not set)
KOAUTH_ISSUER=https://auth.tillmaessen.de

# JWKS endpoint (defaults to KOAUTH_URL/.well-known/jwks.json)
KOAUTH_JWKS_URL=https://auth.tillmaessen.de/.well-known/jwks.json

# Timeout for JWKS fetch requests (milliseconds)
KOAUTH_TIMEOUT=5000
```

**Note:** Most deployments only need `KOAUTH_URL`. The other variables are for advanced configurations where the issuer or JWKS endpoint differ from the main KOauth URL.

## JWKS Caching

The JWKS client implements intelligent caching:

- **Cache Duration:** 1 hour
- **Cooldown Period:** 30 seconds between refetches
- **Auto-Refresh:** Keys are refetched on verification failure (handles key rotation)
- **Multiple Keys:** Supports multiple signing keys in JWKS (matches by `kid`)

## Error Handling

The JWT verifier provides detailed error logging for different failure scenarios:

| Error Type | Log Level | Description |
|------------|-----------|-------------|
| `JWTExpired` | Debug | Token has expired (normal) |
| `JWTClaimValidationFailed` | Warn | Claim validation failed (iss, aud, etc.) |
| `JWSSignatureVerificationFailed` | Warn | Signature verification failed (tampered token) |
| `JWKSNoMatchingKey` | Warn | No matching key in JWKS (key rotation issue) |
| Other | Error | Unknown verification error |

## Testing

### Test Valid JWT

```bash
# 1. Get a valid JWT from KOauth
TOKEN=$(curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.access_token')

# 2. Test valid JWT (should return 200)
curl -i http://localhost:3001/api/notes \
  -H "Authorization: Bearer $TOKEN"
```

### Test Tampered JWT (Should Fail)

```bash
# 3. Test tampered JWT (should return 401)
TAMPERED="${TOKEN}xxx"
curl -i http://localhost:3001/api/notes \
  -H "Authorization: Bearer $TAMPERED"
```

### Test Expired JWT

```bash
# Use an old token from a previous session
curl -i http://localhost:3001/api/notes \
  -H "Authorization: Bearer <old-token>"
```

### Verify JWKS Caching

Check the logs to confirm JWKS is cached:

```bash
# Should only see "Initializing JWKS client" once on startup
# Subsequent requests use cached keys
docker logs kura-notes | grep "JWKS"
```

## Migration Notes

### Breaking Changes

- ❌ Unsigned/tampered JWTs are now rejected (this was the goal!)
- ❌ JWTs with wrong `iss` or `aud` are rejected
- ❌ JWTs without `type` claim are rejected

### Backwards Compatibility

- ✅ OAuth sessions continue to work (tokens are verified, not just decoded)
- ✅ Legacy API keys continue to work (fallback to `/api/validate-key`)
- ✅ No changes required to client applications
- ✅ Automatic token refresh still works

### Deployment Checklist

Before deploying this update:

1. ✅ Ensure KOauth is running with RS256 signing
2. ✅ Verify JWKS endpoint is accessible: `curl https://auth.example.com/.well-known/jwks.json`
3. ✅ Update `KOAUTH_URL` if needed
4. ✅ Test with a real JWT from KOauth
5. ✅ Monitor logs for JWT verification errors
6. ✅ Check that expired tokens are properly rejected

## Dependencies

### Added

- **`jose`** (v5.x) - Modern JWT library with RS256 and JWKS support
  - Zero dependencies
  - Native ES modules support
  - Excellent TypeScript support
  - Built-in JWKS client with caching

### Why `jose`?

Compared to alternatives:

| Library | RS256 | JWKS | Caching | ESM | TypeScript |
|---------|-------|------|---------|-----|------------|
| `jose` | ✅ | ✅ Built-in | ✅ | ✅ | ✅ |
| `jsonwebtoken` | ✅ | ❌ Need separate lib | ❌ | ⚠️ CJS | ⚠️ |
| `jwt-simple` | ❌ HS256 only | ❌ | ❌ | ❌ | ❌ |

## Security Best Practices

### ✅ What We Do

1. **Signature Verification** - All JWTs are cryptographically verified
2. **Issuer Validation** - Only accept tokens from trusted KOauth
3. **Audience Validation** - Only accept tokens intended for kura-notes
4. **Expiration Checking** - Reject expired tokens
5. **Type Validation** - Ensure token is correct type (access_token or api_key)
6. **Public Key Caching** - Minimize JWKS fetches while staying secure
7. **Detailed Logging** - Track all verification failures

### ⚠️ Important

- Never disable signature verification
- Never trust unsigned tokens
- Never accept tokens without proper claims
- Always validate issuer and audience
- Monitor logs for verification failures

## Troubleshooting

### Problem: "JWT signature verification failed"

**Cause:** Token signature doesn't match public key

**Solutions:**
- Ensure KOauth is using RS256 (not HS256)
- Check JWKS endpoint is accessible
- Verify `KOAUTH_URL` matches KOauth's issuer

### Problem: "JWT claim validation failed"

**Cause:** Required claim missing or wrong value

**Solutions:**
- Check `iss` claim matches `KOAUTH_URL`
- Verify `aud` includes `"kura-notes"`
- Ensure token has all required claims (sub, email, type, jti)

### Problem: "No matching key in JWKS"

**Cause:** JWT signed with unknown key (key rotation)

**Solutions:**
- Wait 30 seconds for automatic refresh
- Check JWKS endpoint has the key with matching `kid`
- Verify KOauth hasn't changed signing keys

### Problem: "API key validation failed"

**Cause:** JWT API key has wrong type or is invalid

**Solutions:**
- Ensure API key token has `type: "api_key"` claim
- Regenerate API key from KOauth
- Check token hasn't expired

## References

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 7517 - JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517)
- [RFC 7518 - JSON Web Algorithms (JWA)](https://tools.ietf.org/html/rfc7518)
- [jose Library Documentation](https://github.com/panva/jose)
- [JWKS Best Practices](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets)

## Support

For issues related to:

- **JWT Verification Errors** - Check kura-notes logs
- **JWKS Fetching** - Check KOauth JWKS endpoint
- **Token Generation** - Check KOauth configuration
- **Key Rotation** - Ensure JWKS has multiple keys with `kid`

---

**Security Notice:** This update fixes a critical security vulnerability where JWTs were accepted without signature verification. All instances must be updated immediately.
