/**
 * KURA Notes - JWT Verifier
 *
 * Secure JWT verification using RS256 signatures
 * Validates all required claims: iss, aud, exp, sub, type
 */

import { jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { getRemoteJWKSet } from './jwks-client.js';

/**
 * JWT payload structure from KOauth
 */
export interface KOauthJWTPayload extends JWTPayload {
  // Standard JWT claims
  sub: string;           // User ID
  iss: string;           // Issuer (KOauth URL)
  aud: string | string[]; // Audience (should include "kura-notes")
  exp: number;           // Expiration time (Unix timestamp)
  iat: number;           // Issued at (Unix timestamp)
  jti: string;           // JWT ID (unique token identifier)

  // KOauth custom claims
  email: string;         // User email
  type: 'access_token' | 'api_key'; // Token type

  // Legacy support
  userId?: string;       // Old user ID field (fallback)
}

/**
 * Verified user information extracted from JWT
 */
export interface VerifiedUser {
  id: string;
  email: string;
  tokenType: 'access_token' | 'api_key';
  jti: string;
}

/**
 * Verify JWT token with RS256 signature and claim validation
 *
 * @param token - JWT token to verify
 * @returns Verified user information or null if verification fails
 */
export async function verifyJWT(token: string): Promise<VerifiedUser | null> {
  try {
    // Get the expected issuer (KOauth URL)
    const expectedIssuer = config.koauthIssuer || config.koauthUrl;

    // Remove trailing slash from issuer for comparison
    const normalizedIssuer = expectedIssuer.endsWith('/')
      ? expectedIssuer.slice(0, -1)
      : expectedIssuer;

    // Verify JWT signature and claims
    const { payload } = await jwtVerify<KOauthJWTPayload>(
      token,
      getRemoteJWKSet(),
      {
        // Required claims validation
        issuer: normalizedIssuer,        // Must match KOauth URL
        audience: 'kura-notes',          // Must include our app name
        clockTolerance: 30,              // Allow 30 seconds clock skew
      }
    );

    // Validate required custom claims
    if (!payload.sub) {
      logger.warn('JWT missing required sub claim');
      return null;
    }

    if (!payload.email) {
      logger.warn('JWT missing required email claim');
      return null;
    }

    if (!payload.type || (payload.type !== 'access_token' && payload.type !== 'api_key')) {
      logger.warn('JWT missing or invalid type claim', { type: payload.type });
      return null;
    }

    if (!payload.jti) {
      logger.warn('JWT missing required jti claim');
      return null;
    }

    // Extract user information
    const userId = payload.sub || payload.userId;

    if (!userId) {
      logger.warn('JWT missing user ID (sub and userId both empty)');
      return null;
    }

    logger.debug('JWT verified successfully', {
      userId,
      email: payload.email,
      type: payload.type,
      jti: payload.jti,
      exp: payload.exp,
    });

    return {
      id: userId,
      email: payload.email,
      tokenType: payload.type,
      jti: payload.jti,
    };
  } catch (error) {
    // Log different error types for debugging
    if (error instanceof Error) {
      // jose throws specific error types:
      // - JWTExpired: Token has expired
      // - JWTClaimValidationFailed: Claim validation failed (iss, aud, etc.)
      // - JWSSignatureVerificationFailed: Signature verification failed
      // - JWKSNoMatchingKey: No matching key in JWKS

      const errorName = error.constructor.name;
      const errorMessage = error.message;

      // For claim validation failures, decode the JWT to show actual vs expected values
      if (errorName === 'JWTClaimValidationFailed') {
        const decoded = unsafeDecodeJWT(token);
        const expectedIssuer = config.koauthIssuer || config.koauthUrl;
        const normalizedIssuer = expectedIssuer.endsWith('/')
          ? expectedIssuer.slice(0, -1)
          : expectedIssuer;

        logger.warn('JWT claim validation failed - mismatch detected', {
          error: errorMessage,
          expected: {
            issuer: normalizedIssuer,
            audience: 'kura-notes',
          },
          actual: {
            issuer: decoded?.iss,
            audience: decoded?.aud,
          },
          allClaims: decoded,
        });
      } else if (errorName === 'JWTExpired') {
        logger.debug('JWT token expired', { error: errorMessage });
      } else if (errorName === 'JWSSignatureVerificationFailed') {
        logger.warn('JWT signature verification failed', {
          error: errorMessage,
          hint: 'Check if JWKS endpoint is accessible and keys match',
        });
      } else if (errorName === 'JWKSNoMatchingKey') {
        const decoded = unsafeDecodeJWT(token);
        const tokenParts = token.split('.');
        const kid = decoded && tokenParts[0] 
          ? JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString()).kid 
          : null;

        logger.warn('No matching key in JWKS', {
          error: errorMessage,
          tokenKid: kid,
          hint: 'KOauth may have rotated keys. JWKS will be refetched automatically.',
        });
      } else {
        logger.error('JWT verification error', {
          errorName,
          error: errorMessage,
        });
      }
    } else {
      logger.error('JWT verification error (unknown)', {
        error: String(error),
      });
    }

    return null;
  }
}

/**
 * Check if a string is a JWT token (starts with "eyJ")
 *
 * @param token - String to check
 * @returns True if the string looks like a JWT token
 */
export function isJWT(token: string): boolean {
  // JWT tokens always start with "eyJ" (base64url encoded JSON)
  // This is because the header is always {"alg":"...","typ":"JWT"}
  return token.startsWith('eyJ');
}

/**
 * Decode JWT without verification (for debugging only)
 * DO NOT USE FOR AUTHENTICATION - this is insecure!
 *
 * @param token - JWT token to decode
 * @returns Decoded payload or null if invalid format
 */
export function unsafeDecodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );

    return payload;
  } catch {
    return null;
  }
}
