/**
 * KURA Notes MCP Server - Authentication Module
 *
 * Validates OAuth access tokens and API keys with KOauth service
 * Returns user context for authenticated requests
 */

import { jwtVerify, type JWTPayload } from 'jose';
import { createRemoteJWKSet } from 'jose';

/**
 * User context from authenticated token
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  token: string; // Original token for forwarding to KURA API
  tokenType: 'access_token' | 'api_key';
}

/**
 * KOauth configuration
 */
interface KOauthConfig {
  baseUrl: string;
  timeout: number;
}

// KOauth configuration (set during initialization)
let koauthConfig: KOauthConfig | null = null;

// JWKS client for OAuth token verification
let remoteJWKSet: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Initialize authentication module
 */
export function initAuth(config: KOauthConfig): void {
  koauthConfig = config;

  // Initialize JWKS client for OAuth token verification
  const jwksUrl = `${config.baseUrl.replace(/\/$/, '')}/.well-known/jwks.json`;
  remoteJWKSet = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: 60 * 60 * 1000, // 1 hour cache
    cooldownDuration: 30 * 1000, // 30 seconds cooldown
    timeoutDuration: config.timeout,
  });

  console.log('Authentication module initialized', {
    koauthUrl: config.baseUrl,
    jwksUrl,
  });
}

/**
 * JWT payload structure from KOauth
 */
interface KOauthJWTPayload extends JWTPayload {
  sub: string; // User ID
  iss: string; // Issuer (KOauth URL)
  aud: string | string[]; // Audience (should include "kura-notes")
  exp: number; // Expiration time
  iat: number; // Issued at
  jti: string; // JWT ID
  email: string; // User email
  type: 'access_token' | 'api_key'; // Token type
  userId?: string; // Legacy support
}

/**
 * Check if a string is a JWT token (starts with "eyJ")
 */
function isJWT(token: string): boolean {
  return token.startsWith('eyJ');
}

/**
 * Verify OAuth access token (JWT format)
 */
async function verifyOAuthToken(token: string): Promise<AuthenticatedUser | null> {
  if (!koauthConfig || !remoteJWKSet) {
    console.error('Authentication not initialized');
    return null;
  }

  try {
    const expectedIssuer = koauthConfig.baseUrl.replace(/\/$/, '');

    // Verify JWT signature and claims
    const { payload } = await jwtVerify<KOauthJWTPayload>(token, remoteJWKSet, {
      issuer: expectedIssuer,
      audience: 'kura-notes',
      clockTolerance: 30, // Allow 30 seconds clock skew
    });

    // Validate required claims
    if (!payload.sub || !payload.email || !payload.type) {
      console.warn('JWT missing required claims', {
        hasSub: !!payload.sub,
        hasEmail: !!payload.email,
        hasType: !!payload.type,
      });
      return null;
    }

    // Validate token type (must be access_token for OAuth)
    if (payload.type !== 'access_token') {
      console.warn('JWT token type is not access_token', { type: payload.type });
      return null;
    }

    const userId = payload.sub || payload.userId;
    if (!userId) {
      console.warn('JWT missing user ID');
      return null;
    }

    console.debug('OAuth token verified successfully', {
      userId,
      email: payload.email,
      jti: payload.jti,
    });

    return {
      id: userId,
      email: payload.email,
      token,
      tokenType: 'access_token',
    };
  } catch (error) {
    if (error instanceof Error) {
      const errorName = error.constructor.name;
      if (errorName === 'JWTExpired') {
        console.debug('OAuth token expired');
      } else if (errorName === 'JWTClaimValidationFailed') {
        console.warn('OAuth token claim validation failed', { error: error.message });
      } else if (errorName === 'JWSSignatureVerificationFailed') {
        console.warn('OAuth token signature verification failed', { error: error.message });
      } else {
        console.error('OAuth token verification error', {
          errorName,
          error: error.message,
        });
      }
    } else {
      console.error('OAuth token verification error (unknown)', {
        error: String(error),
      });
    }
    return null;
  }
}

/**
 * Verify API key (JWT format or legacy opaque)
 */
async function verifyApiKey(apiKey: string): Promise<AuthenticatedUser | null> {
  if (!koauthConfig) {
    console.error('Authentication not initialized');
    return null;
  }

  // Check if API key is a JWT token
  if (isJWT(apiKey)) {
    // JWT-based API key - verify signature
    if (!remoteJWKSet) {
      console.error('JWKS client not initialized');
      return null;
    }

    try {
      const expectedIssuer = koauthConfig.baseUrl.replace(/\/$/, '');

      const { payload } = await jwtVerify<KOauthJWTPayload>(apiKey, remoteJWKSet, {
        issuer: expectedIssuer,
        audience: 'kura-notes',
        clockTolerance: 30,
      });

      // Validate required claims
      if (!payload.sub || !payload.email || !payload.type) {
        console.warn('JWT API key missing required claims');
        return null;
      }

      // Validate token type (must be api_key)
      if (payload.type !== 'api_key') {
        console.warn('JWT token type is not api_key', { type: payload.type });
        return null;
      }

      const userId = payload.sub || payload.userId;
      if (!userId) {
        console.warn('JWT API key missing user ID');
        return null;
      }

      console.debug('JWT API key verified successfully', {
        userId,
        email: payload.email,
        jti: payload.jti,
      });

      return {
        id: userId,
        email: payload.email,
        token: apiKey,
        tokenType: 'api_key',
      };
    } catch (error) {
      if (error instanceof Error) {
        const errorName = error.constructor.name;
        if (errorName === 'JWTExpired') {
          console.debug('JWT API key expired');
        } else {
          console.warn('JWT API key verification failed', {
            errorName,
            error: error.message,
          });
        }
      }
      return null;
    }
  }

  // Legacy opaque API key - validate with KOauth service
  console.debug('Validating legacy API key with KOauth service');

  try {
    const baseUrl = koauthConfig.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(koauthConfig.timeout),
    });

    if (!response.ok) {
      console.warn('API key validation failed', { status: response.status });
      return null;
    }

    const data = (await response.json()) as {
      valid: boolean;
      userId?: string;
      email?: string;
      error?: string;
    };

    if (!data.valid) {
      console.warn('API key validation failed', { error: data.error });
      return null;
    }

    if (!data.userId || !data.email) {
      console.error('API key validation response missing required fields', { data });
      return null;
    }

    console.debug('Legacy API key validated successfully', {
      userId: data.userId,
      email: data.email,
    });

    return {
      id: data.userId,
      email: data.email,
      token: apiKey,
      tokenType: 'api_key',
    };
  } catch (error) {
    console.error('Error validating API key with KOauth', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Authenticate request from Authorization header
 * Supports both OAuth access tokens and API keys
 */
export async function authenticate(
  authHeader: string | undefined
): Promise<AuthenticatedUser | null> {
  if (!authHeader) {
    return null;
  }

  // Extract token from "Bearer <token>" format
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('Authorization header does not start with "Bearer"');
    return null;
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    console.warn('Empty token in Authorization header');
    return null;
  }

  // Try OAuth token first (JWT format, type: access_token)
  if (isJWT(token)) {
    const oauthUser = await verifyOAuthToken(token);
    if (oauthUser) {
      return oauthUser;
    }

    // If JWT verification failed, try as API key (type: api_key)
    const apiKeyUser = await verifyApiKey(token);
    if (apiKeyUser) {
      return apiKeyUser;
    }
  } else {
    // Not a JWT - must be legacy opaque API key
    return await verifyApiKey(token);
  }

  return null;
}

