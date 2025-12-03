#!/bin/bash

# OAuth Integration Diagnostic Script
# Tests connectivity and configuration between Kura Notes and KOauth

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KOAUTH_URL="${KOAUTH_URL:-https://auth.tillmaessen.de}"
KURA_URL="${KURA_URL:-https://kura.tillmaessen.de}"

# Helper functions
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    return 0
}

# Start diagnostic
clear
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     Kura Notes ↔ KOauth Integration Diagnostics          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

print_info "KOauth URL: $KOAUTH_URL"
print_info "Kura URL: $KURA_URL"
print_info "Date: $(date '+%Y-%m-%d %H:%M:%S')"

# Check required tools
print_header "Checking Required Tools"

TOOLS_OK=true
for tool in curl jq; do
    if check_command "$tool"; then
        print_success "$tool is installed"
    else
        TOOLS_OK=false
    fi
done

if [ "$TOOLS_OK" = false ]; then
    echo ""
    print_error "Please install missing tools:"
    echo "  Ubuntu/Debian: sudo apt-get install curl jq"
    echo "  macOS: brew install curl jq"
    exit 1
fi

# Test 1: JWKS Endpoint Accessibility
print_header "Test 1: JWKS Endpoint Accessibility"

JWKS_URL="${KOAUTH_URL}/.well-known/jwks.json"
print_info "Testing: $JWKS_URL"

HTTP_CODE=$(curl -s -o /tmp/jwks_response.json -w "%{http_code}" "$JWKS_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    print_success "JWKS endpoint is accessible (HTTP $HTTP_CODE)"

    # Validate JWKS structure
    if jq -e '.keys | length > 0' /tmp/jwks_response.json > /dev/null 2>&1; then
        KEY_COUNT=$(jq '.keys | length' /tmp/jwks_response.json)
        print_success "JWKS contains $KEY_COUNT key(s)"

        echo ""
        print_info "JWKS Details:"
        jq -C '.keys[] | {kid: .kid, kty: .kty, alg: .alg, use: .use}' /tmp/jwks_response.json
    else
        print_error "JWKS response is invalid or empty"
        echo "Response:"
        cat /tmp/jwks_response.json
    fi
elif [ "$HTTP_CODE" = "403" ]; then
    print_error "JWKS endpoint returned 403 Forbidden"
    print_warning "This is a critical issue preventing JWT verification"
    echo ""
    echo "Possible causes:"
    echo "  1. Reverse proxy (Nginx/Caddy) blocking .well-known paths"
    echo "  2. CORS misconfiguration in KOauth"
    echo "  3. Firewall/WAF rules blocking requests"
    echo ""
    echo "Suggested fixes:"
    echo "  • Check reverse proxy configuration"
    echo "  • Verify CORS_ORIGIN in KOauth .env"
    echo "  • Test from server: curl $JWKS_URL"
elif [ "$HTTP_CODE" = "000" ]; then
    print_error "Cannot connect to KOauth server"
    print_warning "Network connectivity issue or server is down"
else
    print_error "JWKS endpoint returned HTTP $HTTP_CODE"
    cat /tmp/jwks_response.json
fi

# Test 2: OpenID Configuration
print_header "Test 2: OpenID Connect Discovery"

OIDC_URL="${KOAUTH_URL}/.well-known/openid-configuration"
print_info "Testing: $OIDC_URL"

HTTP_CODE=$(curl -s -o /tmp/oidc_response.json -w "%{http_code}" "$OIDC_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    print_success "OpenID configuration is accessible (HTTP $HTTP_CODE)"

    if jq -e '.issuer' /tmp/oidc_response.json > /dev/null 2>&1; then
        ISSUER=$(jq -r '.issuer' /tmp/oidc_response.json)
        JWKS_URI=$(jq -r '.jwks_uri' /tmp/oidc_response.json)
        TOKEN_ENDPOINT=$(jq -r '.token_endpoint' /tmp/oidc_response.json)
        AUTH_ENDPOINT=$(jq -r '.authorization_endpoint' /tmp/oidc_response.json)

        echo ""
        print_info "Issuer: $ISSUER"
        print_info "JWKS URI: $JWKS_URI"
        print_info "Token Endpoint: $TOKEN_ENDPOINT"
        print_info "Authorization Endpoint: $AUTH_ENDPOINT"

        # Check issuer format
        if [[ "$ISSUER" == */ ]]; then
            print_warning "Issuer has trailing slash: $ISSUER"
            print_info "Kura normalizes this, but ensure it matches KOAUTH_URL"
        else
            print_success "Issuer format looks good"
        fi
    fi
else
    print_warning "OpenID configuration not available (HTTP $HTTP_CODE)"
    print_info "This is optional but helps with debugging"
fi

# Test 3: Environment Variable Check
print_header "Test 3: Environment Variable Configuration"

print_info "Checking Kura Notes configuration..."

# Try to read from .env file
if [ -f ".env" ]; then
    print_success "Found .env file"

    # Source .env without executing commands
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue

        # Remove quotes and export
        value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

        case "$key" in
            KOAUTH_URL)
                if [ -n "$value" ]; then
                    print_success "KOAUTH_URL is set: $value"
                else
                    print_error "KOAUTH_URL is empty"
                fi
                ;;
            KOAUTH_ISSUER)
                if [ -n "$value" ]; then
                    print_info "KOAUTH_ISSUER is set: $value"
                else
                    print_info "KOAUTH_ISSUER not set (will use KOAUTH_URL)"
                fi
                ;;
            OAUTH_CLIENT_ID)
                if [ -n "$value" ]; then
                    print_success "OAUTH_CLIENT_ID is set: $value"
                else
                    print_error "OAUTH_CLIENT_ID is empty"
                fi
                ;;
            OAUTH_CLIENT_SECRET)
                if [ -n "$value" ]; then
                    SECRET_LEN=${#value}
                    print_success "OAUTH_CLIENT_SECRET is set (${SECRET_LEN} characters)"
                    if [ "$SECRET_LEN" -lt 32 ]; then
                        print_warning "Client secret is short (${SECRET_LEN} chars). Recommended: 32+ characters"
                    fi
                else
                    print_error "OAUTH_CLIENT_SECRET is empty"
                    print_warning "This will cause token exchange to fail with 401 Unauthorized"
                fi
                ;;
            OAUTH_REDIRECT_URI)
                if [ -n "$value" ]; then
                    print_success "OAUTH_REDIRECT_URI is set: $value"
                else
                    print_error "OAUTH_REDIRECT_URI is empty"
                fi
                ;;
            LOG_LEVEL)
                if [ -n "$value" ]; then
                    print_info "LOG_LEVEL is set to: $value"
                    if [ "$value" != "debug" ]; then
                        print_info "Consider setting LOG_LEVEL=debug for troubleshooting"
                    fi
                fi
                ;;
        esac
    done < .env
else
    print_error ".env file not found"
    print_info "Copy .env.example to .env and configure it"
fi

# Test 4: OAuth Endpoints
print_header "Test 4: OAuth Endpoint Availability"

print_info "Testing OAuth authorization endpoint..."
AUTH_URL="${KOAUTH_URL}/oauth/authorize"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AUTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "302" ]; then
    print_success "Authorization endpoint is accessible (HTTP $HTTP_CODE)"
    print_info "400/302 is expected without query parameters"
elif [ "$HTTP_CODE" = "200" ]; then
    print_success "Authorization endpoint is accessible (HTTP $HTTP_CODE)"
else
    print_error "Authorization endpoint returned HTTP $HTTP_CODE"
fi

print_info "Testing OAuth token endpoint..."
TOKEN_URL="${KOAUTH_URL}/oauth/token"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TOKEN_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ]; then
    print_success "Token endpoint is accessible (HTTP $HTTP_CODE)"
    print_info "400/401 is expected without credentials"
elif [ "$HTTP_CODE" = "200" ]; then
    print_warning "Token endpoint returned 200 without credentials (unexpected)"
else
    print_error "Token endpoint returned HTTP $HTTP_CODE"
fi

# Test 5: CORS Headers
print_header "Test 5: CORS Configuration"

print_info "Testing CORS headers on JWKS endpoint..."

CORS_RESPONSE=$(curl -s -I -H "Origin: $KURA_URL" "$JWKS_URL" 2>/dev/null || echo "")

if echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" > /dev/null; then
    CORS_ORIGIN=$(echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" | cut -d: -f2- | tr -d '\r\n' | xargs)
    print_success "CORS is configured: $CORS_ORIGIN"

    if [ "$CORS_ORIGIN" = "*" ]; then
        print_success "CORS allows all origins (*)"
    elif [ "$CORS_ORIGIN" = "$KURA_URL" ]; then
        print_success "CORS allows Kura URL specifically"
    else
        print_warning "CORS origin ($CORS_ORIGIN) doesn't match Kura URL ($KURA_URL)"
    fi
else
    print_warning "No CORS headers found"
    print_info "This might cause issues if Kura and KOauth are on different domains"
fi

# Test 6: SSL Certificate
print_header "Test 6: SSL Certificate Validation"

if [[ "$KOAUTH_URL" == https://* ]]; then
    print_info "Testing SSL certificate..."

    SSL_OUTPUT=$(curl -vI "$KOAUTH_URL" 2>&1)

    if echo "$SSL_OUTPUT" | grep -q "SSL certificate verify ok"; then
        print_success "SSL certificate is valid"
    elif echo "$SSL_OUTPUT" | grep -q "certificate verify failed"; then
        print_error "SSL certificate verification failed"
        print_warning "This will prevent HTTPS connections"
    else
        print_info "SSL status unclear (check manually with: curl -vI $KOAUTH_URL)"
    fi
else
    print_warning "KOauth is using HTTP (not HTTPS)"
    print_info "This is acceptable for development but not for production"
fi

# Test 7: DNS Resolution
print_header "Test 7: DNS Resolution"

KOAUTH_DOMAIN=$(echo "$KOAUTH_URL" | sed -e 's|^https\?://||' -e 's|/.*||')
print_info "Resolving: $KOAUTH_DOMAIN"

if host "$KOAUTH_DOMAIN" > /dev/null 2>&1; then
    IP_ADDRESS=$(host "$KOAUTH_DOMAIN" | grep "has address" | head -1 | awk '{print $4}')
    if [ -n "$IP_ADDRESS" ]; then
        print_success "DNS resolves to: $IP_ADDRESS"
    else
        print_success "DNS resolves successfully"
    fi
else
    print_error "DNS resolution failed for $KOAUTH_DOMAIN"
fi

KURA_DOMAIN=$(echo "$KURA_URL" | sed -e 's|^https\?://||' -e 's|/.*||')
print_info "Resolving: $KURA_DOMAIN"

if host "$KURA_DOMAIN" > /dev/null 2>&1; then
    IP_ADDRESS=$(host "$KURA_DOMAIN" | grep "has address" | head -1 | awk '{print $4}')
    if [ -n "$IP_ADDRESS" ]; then
        print_success "DNS resolves to: $IP_ADDRESS"
    else
        print_success "DNS resolves successfully"
    fi
else
    print_error "DNS resolution failed for $KURA_DOMAIN"
fi

# Summary
print_header "Diagnostic Summary"

echo ""
echo "Key Findings:"
echo ""

# JWKS Check
if [ "$HTTP_CODE" = "200" ]; then
    print_success "JWKS endpoint is accessible and working"
else
    print_error "JWKS endpoint is NOT accessible (critical issue)"
    echo "  → This prevents all JWT token verification"
    echo "  → Fix: Check reverse proxy configuration"
    echo "  → See: docs/OAUTH_DIAGNOSTIC_REPORT.md"
fi

# Environment Variables
if [ -f ".env" ]; then
    if grep -q "OAUTH_CLIENT_SECRET=\$\|OAUTH_CLIENT_SECRET=\"\"\|OAUTH_CLIENT_SECRET=''" .env 2>/dev/null || \
       ! grep -q "OAUTH_CLIENT_SECRET" .env 2>/dev/null; then
        print_error "OAUTH_CLIENT_SECRET is not set"
        echo "  → Token exchange will fail with 401 Unauthorized"
        echo "  → Fix: Generate and set client secret"
        echo "  → Run: openssl rand -hex 32"
    else
        print_success "OAUTH_CLIENT_SECRET is configured"
    fi
fi

echo ""
print_info "Next Steps:"
echo ""
echo "1. Review detailed report: docs/OAUTH_DIAGNOSTIC_REPORT.md"
echo "2. If JWKS fails: Check reverse proxy configuration"
echo "3. If client secret missing: Generate and set OAUTH_CLIENT_SECRET"
echo "4. Enable debug logging: LOG_LEVEL=debug in .env"
echo "5. Test OAuth flow: Visit $KURA_URL/oauth/authorize"
echo "6. Monitor logs: docker logs -f kura-notes-api | grep -i jwt"
echo ""

print_header "End of Diagnostics"

# Cleanup
rm -f /tmp/jwks_response.json /tmp/oidc_response.json

echo ""
print_info "Diagnostic completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
