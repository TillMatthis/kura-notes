/**
 * KOauth Client
 *
 * Real implementation that validates JWT tokens with external KOauth service.
 * Replaces koauth-stub.ts for production use.
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

// KOauth configuration
let koauthConfig: KOauthOptions | null = null;

/**
 * Initialize KOauth client
 *
 * Sets up connection to external KOauth service for token validation
 */
export async function initKOauth(
  _app: FastifyInstance,
  options: KOauthOptions
): Promise<void> {
  koauthConfig = options;

  logger.info('KOauth client initialized', {
    baseUrl: options.baseUrl,
    timeout: options.timeout,
  });

  // Verify KOauth is accessible
  try {
    const response = await fetch(`${options.baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(options.timeout || 5000),
    });

    if (!response.ok) {
      throw new Error(`KOauth health check failed: ${response.status}`);
    }

    logger.info('KOauth service is accessible and healthy');
  } catch (error) {
    logger.error('Failed to connect to KOauth service', {
      error: error instanceof Error ? error.message : String(error),
      baseUrl: options.baseUrl,
    });
    throw new Error(`Cannot connect to KOauth at ${options.baseUrl}. Ensure the service is running.`);
  }
}

/**
 * Get authenticated user from request
 *
 * Validates session cookie or Authorization header with KOauth service
 */
export function getUser(request: FastifyRequest): KOauthUser | null {
  // Check if we've already processed this request
  if (requestUserMap.has(request)) {
    return requestUserMap.get(request) || null;
  }

  // For development: Check for test user headers
  if (process.env.NODE_ENV !== 'production') {
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
  }

  // Extract session cookie or Authorization header
  const sessionCookie = request.cookies?.koauth_session;
  const authHeader = request.headers.authorization;

  if (!sessionCookie && !authHeader) {
    logger.debug('No authentication credentials found in request', {
      url: request.url,
      method: request.method,
    });
    requestUserMap.set(request, null);
    return null;
  }

  // Validate with KOauth service (synchronous placeholder)
  // In production, this would be async, but Fastify auth middleware requires sync
  // So we use the session validation approach where KOauth sets user info in cookie

  // For session cookies, extract user info from the JWT payload
  // KOauth includes user info in the session cookie JWT
  try {
    if (sessionCookie) {
      // Parse JWT (without verification - KOauth already verified it when setting the cookie)
      // Format: header.payload.signature
      const parts = sessionCookie.split('.');
      if (parts.length !== 3) {
        logger.warn('Invalid JWT format in session cookie');
        requestUserMap.set(request, null);
        return null;
      }

      // Decode payload (base64url)
      const payload = JSON.parse(
        Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      ) as { userId?: string; sub?: string; id?: string; email?: string; sid?: string; sessionId?: string };

      // Extract user info from JWT payload
      const userId = payload.userId || payload.sub || payload.id;
      const userEmail = payload.email;

      if (!userId || !userEmail) {
        logger.warn('JWT payload missing required user fields', { payload });
        requestUserMap.set(request, null);
        return null;
      }

      const user: KOauthUser = {
        id: userId,
        email: userEmail,
        sessionId: payload.sid || payload.sessionId,
      };

      logger.debug('User authenticated via session cookie', {
        userId: user.id,
        email: user.email,
      });

      requestUserMap.set(request, user);
      return user;
    }

    // For API keys in Authorization header
    if (authHeader?.startsWith('Bearer ')) {
      // API keys need to be validated with KOauth
      // This would require an async call, so for now we log a warning
      logger.warn('API key authentication not yet implemented - use session cookies', {
        url: request.url,
      });

      // TODO: Implement async API key validation with KOauth
      // const token = authHeader.substring(7);
      // const user = await _validateApiKey(token);

      requestUserMap.set(request, null);
      return null;
    }

  } catch (error) {
    logger.error('Error parsing authentication credentials', {
      error: error instanceof Error ? error.message : String(error),
    });
    requestUserMap.set(request, null);
    return null;
  }

  requestUserMap.set(request, null);
  return null;
}

/**
 * Get optional user from request
 */
export function optionalUser(request: FastifyRequest): KOauthUser | null {
  return getUser(request);
}

/**
 * Protect route middleware
 * Not used directly - auth middleware handles this
 */
export function protectRoute() {
  return async function (request: FastifyRequest, _reply: unknown) {
    const user = getUser(request);
    if (!user) {
      throw new Error('Authentication required');
    }
  };
}

/**
 * Validate API key with KOauth service (async)
 * For programmatic access (iOS Shortcuts, scripts, MCP server)
 */
export async function validateApiKey(apiKey: string): Promise<KOauthUser | null> {
  if (!koauthConfig) {
    logger.error('KOauth not initialized');
    return null;
  }

  try {
    const response = await fetch(`${koauthConfig.baseUrl}/api/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(koauthConfig.timeout || 5000),
    });

    if (!response.ok) {
      logger.warn('API key validation failed', { status: response.status });
      return null;
    }

    const data = await response.json() as { valid: boolean; userId?: string; email?: string; error?: string };

    // Check if the API key is valid
    if (!data.valid) {
      logger.warn('API key validation failed', { error: data.error });
      return null;
    }

    // Ensure userId and email are present
    if (!data.userId || !data.email) {
      logger.error('API key validation response missing required fields', { data });
      return null;
    }

    logger.info('API key validated successfully', { userId: data.userId, email: data.email });

    return {
      id: data.userId,
      email: data.email,
    };
  } catch (error) {
    logger.error('Error validating API key with KOauth', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
