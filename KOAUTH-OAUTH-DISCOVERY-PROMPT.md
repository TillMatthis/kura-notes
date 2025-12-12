# Prompt: Implement OAuth Authorization Server Metadata Endpoint in KOauth

## Task

Implement the RFC 8414 OAuth 2.0 Authorization Server Metadata endpoint in the KOauth project. This endpoint allows OAuth clients (like Claude Custom Connectors) to automatically discover the authorization server configuration.

## Requirements

### 1. Endpoint Path
- **Path:** `/.well-known/oauth-authorization-server`
- **Method:** `GET`
- **Content-Type:** `application/json`

### 2. Must Be Publicly Accessible
- **No authentication required** - This is a discovery endpoint that must be accessible without credentials
- Should return HTTP 200 even without any authentication headers
- Must be accessible from cross-origin requests (CORS enabled)

### 3. CORS Support
- Must include CORS headers for cross-origin requests:
  - `Access-Control-Allow-Origin: *` (or specific origins)
  - `Access-Control-Allow-Methods: GET, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization`
- Must handle OPTIONS preflight requests (return 204 No Content)

### 4. Response Format (RFC 8414)

The endpoint must return JSON with the following **required** fields:

```json
{
  "issuer": "https://auth.tillmaessen.de",
  "authorization_endpoint": "https://auth.tillmaessen.de/oauth/authorize",
  "token_endpoint": "https://auth.tillmaessen.de/oauth/token",
  "jwks_uri": "https://auth.tillmaessen.de/.well-known/jwks.json"
}
```

**Optional but recommended fields:**

```json
{
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256", "plain"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "response_modes_supported": ["query"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

### 5. Dynamic Configuration

The endpoint should dynamically determine values from:
- **issuer**: Use `JWT_ISSUER` environment variable (or default to base URL)
- **authorization_endpoint**: `${issuer}/oauth/authorize`
- **token_endpoint**: `${issuer}/oauth/token`
- **jwks_uri**: `${issuer}/.well-known/jwks.json`
- **scopes_supported**: Based on available scopes in KOauth
- **code_challenge_methods_supported**: Must include `"S256"` (PKCE) - **required for Claude**

### 6. Error Handling

- Should never return 401/403 (must be publicly accessible)
- Should return 500 only if there's a server error
- Should return valid JSON even if some optional fields are missing

## Example Implementation

Here's what the endpoint should look like:

```typescript
// GET /.well-known/oauth-authorization-server
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const issuer = process.env.JWT_ISSUER || getBaseUrl(req);
  
  const metadata = {
    // REQUIRED fields (RFC 8414)
    issuer: issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    
    // RECOMMENDED fields
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'], // S256 is REQUIRED for Claude
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    response_modes_supported: ['query'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  };
  
  res
    .set('Content-Type', 'application/json')
    .set('Access-Control-Allow-Origin', '*')
    .set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    .set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .json(metadata);
});

// OPTIONS for CORS preflight
app.options('/.well-known/oauth-authorization-server', (req, res) => {
  res
    .set('Access-Control-Allow-Origin', '*')
    .set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    .set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .status(204)
    .send();
});
```

## Testing

After implementation, verify with:

```bash
# Test the endpoint
curl https://auth.tillmaessen.de/.well-known/oauth-authorization-server

# Expected: HTTP 200 with JSON metadata

# Test CORS
curl -H "Origin: https://claude.ai" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://auth.tillmaessen.de/.well-known/oauth-authorization-server

# Expected: HTTP 204 with CORS headers
```

## Critical Notes

1. **PKCE Support**: The `code_challenge_methods_supported` array **MUST** include `"S256"` - Claude requires PKCE (Proof Key for Code Exchange) for security
2. **Public Access**: This endpoint must work without any authentication - it's a discovery endpoint
3. **CORS**: Must support cross-origin requests from `https://claude.ai` (or use `*` for development)
4. **Issuer Match**: The `issuer` field must exactly match `JWT_ISSUER` environment variable used for JWT token signing

## Reference

- **RFC 8414**: OAuth 2.0 Authorization Server Metadata
- **RFC 7636**: Proof Key for Code Exchange by OAuth Public Clients (PKCE)
- **Claude Custom Connectors**: Requires PKCE (S256) support
