#!/bin/bash

# MCP OAuth Debugging Script
# Tests all endpoints and OAuth flow

set -e

MCP_URL="${1:-https://kura.tillmaessen.de/mcp}"
KOAUTH_URL="${2:-https://auth.tillmaessen.de}"

echo "=========================================="
echo "MCP OAuth Debugging Script"
echo "=========================================="
echo "MCP URL: $MCP_URL"
echo "KOauth URL: $KOAUTH_URL"
echo ""

# Test 1: Health endpoint
echo "1. Testing Health Endpoint..."
echo "   GET $MCP_URL/health"
HEALTH_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$MCP_URL/health")
HEALTH_HTTP_STATUS=$(echo "$HEALTH_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '/HTTP_STATUS/d')
echo "   Status: $HEALTH_HTTP_STATUS"
echo "   Response: $HEALTH_BODY"
echo ""

if [ "$HEALTH_HTTP_STATUS" != "200" ]; then
    echo "   ❌ Health check failed!"
    exit 1
fi
echo "   ✅ Health check passed"
echo ""

# Test 2: OAuth Discovery Endpoint
echo "2. Testing OAuth Discovery Endpoint..."
echo "   GET $MCP_URL/.well-known/oauth-protected-resource"
DISCOVERY_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$MCP_URL/.well-known/oauth-protected-resource")
DISCOVERY_HTTP_STATUS=$(echo "$DISCOVERY_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
DISCOVERY_BODY=$(echo "$DISCOVERY_RESPONSE" | sed '/HTTP_STATUS/d')
echo "   Status: $DISCOVERY_HTTP_STATUS"
echo "   Response: $DISCOVERY_BODY"
echo ""

if [ "$DISCOVERY_HTTP_STATUS" != "200" ]; then
    echo "   ❌ Discovery endpoint failed!"
    echo "   This is likely the problem!"
    exit 1
fi

# Validate JSON structure and RFC 9728 compliance
if echo "$DISCOVERY_BODY" | jq -e '.resource' > /dev/null 2>&1; then
    RESOURCE=$(echo "$DISCOVERY_BODY" | jq -r '.resource')
    AUTH_SERVERS=$(echo "$DISCOVERY_BODY" | jq -r '.authorization_servers[]' 2>/dev/null | tr '\n' ' ' || echo "not found")
    SCOPES=$(echo "$DISCOVERY_BODY" | jq -r '.scopes_supported[]' 2>/dev/null | tr '\n' ' ' || echo "not found")
    BEARER_METHODS=$(echo "$DISCOVERY_BODY" | jq -r '.bearer_methods_supported[]' 2>/dev/null | tr '\n' ' ' || echo "not found")
    JWKS_URI=$(echo "$DISCOVERY_BODY" | jq -r '.jwks_uri' 2>/dev/null || echo "not found")
    
    echo "   ✅ Discovery endpoint working (RFC 9728)"
    echo "   Resource: $RESOURCE"
    echo "   Authorization Servers: $AUTH_SERVERS"
    echo "   Supported Scopes: $SCOPES"
    echo "   Bearer Methods: $BEARER_METHODS"
    if [ "$JWKS_URI" != "not found" ] && [ "$JWKS_URI" != "null" ]; then
        echo "   JWKS URI: $JWKS_URI"
    fi
    
    # Validate resource is absolute URL
    if [[ "$RESOURCE" == http://* ]] || [[ "$RESOURCE" == https://* ]]; then
        echo "   ✅ Resource is absolute URL (required)"
    else
        echo "   ⚠️  Resource is not absolute URL - may cause issues"
    fi
else
    echo "   ❌ Invalid JSON response or missing required 'resource' field (RFC 9728)"
    exit 1
fi
echo ""

# Test 3: SSE Endpoint (should return 401)
echo "3. Testing SSE Endpoint (unauthenticated)..."
echo "   GET $MCP_URL/sse"
SSE_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -H "Accept: text/event-stream" "$MCP_URL/sse" 2>&1)
SSE_HTTP_STATUS=$(echo "$SSE_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2 || echo "unknown")
SSE_BODY=$(echo "$SSE_RESPONSE" | sed '/HTTP_STATUS/d' | head -5)
WWW_AUTH=$(curl -s -I "$MCP_URL/sse" 2>&1 | grep -i "www-authenticate" || echo "not found")

echo "   Status: $SSE_HTTP_STATUS"
echo "   WWW-Authenticate: $WWW_AUTH"
echo "   Response (first 5 lines):"
echo "$SSE_BODY" | head -5
echo ""

if [ "$SSE_HTTP_STATUS" = "401" ]; then
    echo "   ✅ SSE endpoint correctly returns 401"
    if echo "$WWW_AUTH" | grep -q "WWW-Authenticate"; then
        echo "   ✅ WWW-Authenticate header present"
    else
        echo "   ⚠️  WWW-Authenticate header missing!"
    fi
else
    echo "   ❌ SSE endpoint should return 401, got $SSE_HTTP_STATUS"
fi
echo ""

# Test 4: KOauth Authorization Server Metadata (RFC 8414)
echo "4. Testing KOauth Authorization Server Metadata (RFC 8414)..."
echo "   GET $KOAUTH_URL/.well-known/oauth-authorization-server"
KOAUTH_DISCOVERY=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$KOAUTH_URL/.well-known/oauth-authorization-server" 2>&1)
KOAUTH_HTTP_STATUS=$(echo "$KOAUTH_DISCOVERY" | grep "HTTP_STATUS" | cut -d: -f2)
KOAUTH_BODY=$(echo "$KOAUTH_DISCOVERY" | sed '/HTTP_STATUS/d')

echo "   Status: $KOAUTH_HTTP_STATUS"
if [ "$KOAUTH_HTTP_STATUS" = "200" ]; then
    # Validate RFC 8414 required fields
    if echo "$KOAUTH_BODY" | jq -e '.issuer' > /dev/null 2>&1 && \
       echo "$KOAUTH_BODY" | jq -e '.authorization_endpoint' > /dev/null 2>&1 && \
       echo "$KOAUTH_BODY" | jq -e '.token_endpoint' > /dev/null 2>&1 && \
       echo "$KOAUTH_BODY" | jq -e '.jwks_uri' > /dev/null 2>&1; then
        echo "   ✅ KOauth authorization server metadata endpoint working (RFC 8414 compliant)"
        ISSUER=$(echo "$KOAUTH_BODY" | jq -r '.issuer' 2>/dev/null || echo "not found")
        AUTH_ENDPOINT=$(echo "$KOAUTH_BODY" | jq -r '.authorization_endpoint' 2>/dev/null || echo "not found")
        TOKEN_ENDPOINT=$(echo "$KOAUTH_BODY" | jq -r '.token_endpoint' 2>/dev/null || echo "not found")
        JWKS_URI=$(echo "$KOAUTH_BODY" | jq -r '.jwks_uri' 2>/dev/null || echo "not found")
        SCOPES=$(echo "$KOAUTH_BODY" | jq -r '.scopes_supported[]' 2>/dev/null | tr '\n' ' ' || echo "not found")
        RESPONSE_TYPES=$(echo "$KOAUTH_BODY" | jq -r '.response_types_supported[]' 2>/dev/null | tr '\n' ' ' || echo "not found")
        CODE_CHALLENGE_METHODS=$(echo "$KOAUTH_BODY" | jq -r '.code_challenge_methods_supported[]' 2>/dev/null | tr '\n' ' ' || echo "not found")
        
        echo "   Issuer: $ISSUER"
        echo "   Authorization Endpoint: $AUTH_ENDPOINT"
        echo "   Token Endpoint: $TOKEN_ENDPOINT"
        echo "   JWKS URI: $JWKS_URI"
        echo "   Supported Scopes: $SCOPES"
        echo "   Response Types: $RESPONSE_TYPES"
        echo "   Code Challenge Methods: $CODE_CHALLENGE_METHODS"
        
        # Check for PKCE support (required for Claude)
        if echo "$CODE_CHALLENGE_METHODS" | grep -q "S256"; then
            echo "   ✅ PKCE (S256) supported - Required for Claude Custom Connector"
        else
            echo "   ⚠️  PKCE (S256) not found - Claude may require this"
        fi
    else
        echo "   ❌ KOauth metadata missing required RFC 8414 fields!"
        echo "   Required fields: issuer, authorization_endpoint, token_endpoint, jwks_uri"
        echo "   Response: $KOAUTH_BODY"
    fi
else
    echo "   ❌ KOauth authorization server metadata endpoint returned $KOAUTH_HTTP_STATUS"
    echo "   This endpoint is required for OAuth autodiscovery (RFC 8414)"
    echo "   Response: $KOAUTH_BODY"
fi
echo ""

# Test 5: CORS Headers Check
echo "5. Testing CORS Headers for Discovery Endpoint..."
echo "   GET $MCP_URL/.well-known/oauth-protected-resource (with Origin header)"
CORS_RESPONSE=$(curl -s -I -H "Origin: https://claude.ai" "$MCP_URL/.well-known/oauth-protected-resource" 2>&1)
CORS_HEADER=$(echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" || echo "not found")
CORS_METHODS=$(echo "$CORS_RESPONSE" | grep -i "access-control-allow-methods" || echo "not found")

if echo "$CORS_HEADER" | grep -q "access-control-allow-origin"; then
    echo "   ✅ CORS headers present"
    echo "   $CORS_HEADER"
    if [ "$CORS_METHODS" != "not found" ]; then
        echo "   $CORS_METHODS"
    fi
else
    echo "   ⚠️  CORS headers not found - Claude web app may have issues"
    echo "   Consider adding CORS headers for claude.ai origin"
fi
echo ""

# Test 6: Test OAuth Authorization URL Format (without actually authorizing)
echo "6. Testing OAuth Authorization URL Format..."
echo "   This shows what the authorization URL should look like"
CLIENT_ID="claude-mcp"
REDIRECT_URI_WEB="https://claude.ai/api/mcp/auth_callback"
REDIRECT_URI_DESKTOP="http://127.0.0.1:6277/callback"
SCOPE="openid profile email"
STATE="test-state-123"

echo "   For Claude Web:"
AUTH_URL_WEB="$KOAUTH_URL/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI_WEB&scope=$SCOPE&state=$STATE&code_challenge=test_challenge&code_challenge_method=S256"
echo "   $AUTH_URL_WEB"
echo ""
echo "   For Claude Desktop:"
AUTH_URL_DESKTOP="$KOAUTH_URL/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI_DESKTOP&scope=$SCOPE&state=$STATE&code_challenge=test_challenge&code_challenge_method=S256"
echo "   $AUTH_URL_DESKTOP"
echo ""
echo "   ⚠️  Note: Replace CLIENT_ID with your actual OAuth client ID"
echo "   ⚠️  Note: REDIRECT_URI must match exactly what Claude expects"
echo "   ⚠️  Note: Both redirect URIs must be registered in KOauth OAuth client"
echo ""

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "✅ Health endpoint: Working"

# Discovery endpoint summary
DISCOVERY_STATUS="❌"
if [ "$DISCOVERY_HTTP_STATUS" = "200" ] && echo "$DISCOVERY_BODY" | jq -e '.resource' > /dev/null 2>&1; then
    DISCOVERY_STATUS="✅"
fi
echo "$DISCOVERY_STATUS Discovery endpoint (RFC 9728): $([ "$DISCOVERY_STATUS" = "✅" ] && echo "Working" || echo "FAILED")"

# SSE endpoint summary  
SSE_STATUS="❌"
if [ "$SSE_HTTP_STATUS" = "401" ]; then
    SSE_STATUS="✅"
fi
echo "$SSE_STATUS SSE endpoint: $([ "$SSE_STATUS" = "✅" ] && echo "Returns 401 correctly" || echo "Not returning 401")"

# KOauth metadata summary
KOAUTH_STATUS="❌"
if [ "$KOAUTH_HTTP_STATUS" = "200" ] && echo "$KOAUTH_BODY" | jq -e '.issuer' > /dev/null 2>&1; then
    KOAUTH_STATUS="✅"
fi
echo "$KOAUTH_STATUS KOauth authorization server metadata (RFC 8414): $([ "$KOAUTH_STATUS" = "✅" ] && echo "Working" || echo "FAILED")"

# CORS summary
CORS_STATUS="⚠️"
if echo "$CORS_HEADER" | grep -q "access-control-allow-origin"; then
    CORS_STATUS="✅"
fi
echo "$CORS_STATUS CORS headers: $([ "$CORS_STATUS" = "✅" ] && echo "Present" || echo "Missing")"

echo ""
echo "Next Steps:"
echo "1. Verify discovery endpoint returns correct RFC 9728 JSON"
echo "2. Verify KOauth provides RFC 8414 authorization server metadata"
echo "3. Register OAuth client in KOauth with these redirect URIs:"
echo "   - https://claude.ai/api/mcp/auth_callback (web)"
echo "   - http://127.0.0.1:6277/callback (desktop)"
echo "   - http://127.0.0.1:6278/callback (desktop fallback)"
echo "   - http://127.0.0.1:6279/callback (desktop fallback)"
echo "4. Check MCP server logs: docker logs kura-notes-mcp"
echo "5. Check Caddy logs: sudo journalctl -u caddy -f"
echo "6. Test OAuth flow with MCP Inspector: npx @modelcontextprotocol/inspector"


