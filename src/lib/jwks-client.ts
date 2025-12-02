/**
 * KURA Notes - JWKS Client
 *
 * Fetches and caches RSA public keys from KOauth's JWKS endpoint
 * Handles key rotation and automatic refresh
 */

import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

/**
 * JWKS URL derived from KOauth URL
 */
function getJwksUrl(): string {
  const koauthUrl = config.koauthIssuer || config.koauthUrl;

  // Remove trailing slash if present
  const baseUrl = koauthUrl.endsWith('/') ? koauthUrl.slice(0, -1) : koauthUrl;

  return `${baseUrl}/.well-known/jwks.json`;
}

/**
 * Remote JWKS instance with automatic caching and key rotation support
 * The jose library handles:
 * - Fetching keys from the JWKS endpoint
 * - Caching keys with automatic refresh
 * - Key rotation (multiple keys in JWKS)
 * - Stale key refresh on verification failure
 */
let remoteJWKSet: JWTVerifyGetKey | null = null;

/**
 * Get the remote JWKS instance
 * Creates one if it doesn't exist
 */
export function getRemoteJWKSet(): JWTVerifyGetKey {
  if (!remoteJWKSet) {
    const jwksUrl = getJwksUrl();

    logger.info('Initializing JWKS client', { jwksUrl });

    // Create remote JWKS with jose's built-in caching
    // The library automatically:
    // - Caches keys with a default cooldown period
    // - Refetches on verification failure (key rotation)
    // - Handles multiple keys (kid matching)
    remoteJWKSet = createRemoteJWKSet(new URL(jwksUrl), {
      // Cache duration: 1 hour (in milliseconds)
      cacheMaxAge: 60 * 60 * 1000,

      // Allow refetch on verification failure (stale keys)
      cooldownDuration: 30 * 1000, // 30 seconds cooldown between refetches

      // Timeout for JWKS fetch requests
      timeoutDuration: config.koauthTimeout || 5000,
    });

    logger.info('JWKS client initialized successfully');
  }

  return remoteJWKSet;
}

/**
 * Reset the JWKS client (for testing or configuration changes)
 */
export function resetJWKSClient(): void {
  remoteJWKSet = null;
  logger.debug('JWKS client reset');
}
