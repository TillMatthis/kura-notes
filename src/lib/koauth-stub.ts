/**
 * KOauth Client Stub
 *
 * Temporary implementation until @tillmatthis/koauth-client is published and built.
 * This stub provides the same API as the real KOauth client for development.
 *
 * TODO: Replace with actual @tillmatthis/koauth-client when available
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger.js';

export interface KOauthUser {
  id: string;
  email: string;
  sessionId?: string;
}

export interface KOauthOptions {
  baseUrl: string;
  timeout?: number;
  onError?: (error: Error) => void;
}

// Store user data attached to requests
const requestUserMap = new WeakMap<FastifyRequest, KOauthUser | null>();

/**
 * Initialize KOauth client (stub implementation)
 *
 * In production, this would:
 * - Set up connection to auth.tillmaessen.de
 * - Configure session handling
 * - Set up JWT validation
 *
 * For now, it just logs the configuration.
 */
export async function initKOauth(
  _app: FastifyInstance,
  options: KOauthOptions
): Promise<void> {
  logger.info('KOauth stub initialized', {
    baseUrl: options.baseUrl,
    timeout: options.timeout,
  });

  logger.warn('⚠️  Using KOauth STUB implementation - authentication is DISABLED for development');
  logger.warn('⚠️  Replace with real @tillmatthis/koauth-client before production deployment');

  // In the real implementation, this would set up Fastify decorators,
  // hooks for session handling, and JWT validation middleware
}

/**
 * Get authenticated user from request (stub implementation)
 *
 * In production, this would:
 * - Check for session cookie
 * - Validate JWT in Authorization header
 * - Verify API key if present
 * - Return user data from KOauth
 *
 * For now, it returns a mock user for development.
 */
export function getUser(request: FastifyRequest): KOauthUser | null {
  // Check if we've already processed this request
  if (requestUserMap.has(request)) {
    return requestUserMap.get(request) || null;
  }

  // In development, check for a test user ID in headers
  const testUserId = request.headers['x-test-user-id'] as string;
  const testUserEmail = request.headers['x-test-user-email'] as string;

  if (testUserId) {
    const user: KOauthUser = {
      id: testUserId,
      email: testUserEmail || `user-${testUserId}@test.local`,
    };
    requestUserMap.set(request, user);
    return user;
  }

  // For development, return a default test user
  // TODO: Remove this in production - require real authentication
  const defaultUser: KOauthUser = {
    id: 'dev-user-00000000-0000-0000-0000-000000000000',
    email: 'dev@kura.local',
  };

  requestUserMap.set(request, defaultUser);

  logger.debug('KOauth stub: returning default development user', {
    userId: defaultUser.id,
    email: defaultUser.email,
  });

  return defaultUser;
}

/**
 * Get optional user from request (stub implementation)
 */
export function optionalUser(request: FastifyRequest): KOauthUser | null {
  return getUser(request);
}

/**
 * Protect route middleware (stub implementation)
 *
 * In production, this would reject requests without valid authentication.
 * For now, it allows all requests through.
 */
export function protectRoute() {
  return async function (_request: FastifyRequest, _reply: unknown) {
    // In production, this would throw 401 if no valid auth
    // For development, we allow everything through
    logger.debug('KOauth stub: protectRoute - allowing request (development mode)');
  };
}
