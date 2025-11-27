/**
 * KURA Notes - Authentication Middleware
 *
 * OAuth-based authentication using KOauth
 * Replaces the previous API key authentication system
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';
import { validateApiKey } from '../../lib/koauth-client.js';

// KOauth will be initialized in server.ts and provide these functions
// Import will be added after KOauth initialization
let koauthGetUser: ((request: FastifyRequest) => { id: string; email: string; sessionId?: string } | null) | null = null;

// Store users authenticated via API keys
const apiKeyUserMap = new WeakMap<FastifyRequest, { id: string; email: string } | null>();

/**
 * Set KOauth getUser function
 * Called from server.ts after KOauth initialization
 */
export function setKoauthGetUser(getUserFn: (request: FastifyRequest) => { id: string; email: string; sessionId?: string } | null) {
  koauthGetUser = getUserFn;
}

/**
 * List of paths that don't require authentication
 */
const PUBLIC_PATHS = [
  '/api/health',
  '/health',
  '/api/me',           // User profile endpoint (will check auth internally)
  '/api/logout',       // Logout endpoint
];

/**
 * Static file extensions that don't require authentication
 */
const STATIC_FILE_EXTENSIONS = [
  '.html', '.css', '.js', '.ico', '.png', '.jpg', '.jpeg', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'
];

/**
 * Authentication middleware using KOauth
 * Validates JWT tokens, API keys, or session cookies
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Skip authentication for public paths
  if (PUBLIC_PATHS.includes(request.url)) {
    return;
  }

  // Skip authentication for static files (web interface)
  const urlPath = request.url.split('?')[0] || ''; // Remove query params
  if (STATIC_FILE_EXTENSIONS.some(ext => urlPath.endsWith(ext)) || urlPath === '/') {
    return;
  }

  // Skip authentication for auth-related routes
  if (urlPath.startsWith('/auth')) {
    return;
  }

  // Check if KOauth is initialized
  if (!koauthGetUser) {
    logger.error('KOauth not initialized - authentication unavailable');
    throw ApiErrors.unauthorized('Authentication system not initialized');
  }

  // First, try session-based authentication (synchronous, no external call needed)
  const sessionUser = koauthGetUser(request);

  if (sessionUser) {
    // Session authentication successful
    logger.debug('Session authentication successful', {
      method: request.method,
      url: request.url,
      userId: sessionUser.id,
      email: sessionUser.email,
    });
    return;
  }

  // If no session, check for Bearer token (API key authentication)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);

    try {
      const apiKeyUser = await validateApiKey(apiKey);

      if (apiKeyUser) {
        // Store API key user in WeakMap for later retrieval
        apiKeyUserMap.set(request, apiKeyUser);

        logger.debug('API key authentication successful', {
          method: request.method,
          url: request.url,
          userId: apiKeyUser.id,
          email: apiKeyUser.email,
        });
        return;
      }
    } catch (error) {
      logger.warn('API key validation error', {
        error: error instanceof Error ? error.message : String(error),
        method: request.method,
        url: request.url,
      });
    }
  }

  // No valid authentication found
  logger.warn('Authentication failed - no valid credentials', {
    method: request.method,
    url: request.url,
    ip: request.ip,
    hasAuthHeader: !!authHeader,
  });
  throw ApiErrors.unauthorized('Authentication required');
}

/**
 * Get authenticated user from request
 * Helper function for routes to extract user information
 * Checks both session-based and API key authentication
 * @throws ApiError if user is not authenticated
 */
export function getAuthenticatedUser(request: FastifyRequest): { id: string; email: string; sessionId?: string } {
  if (!koauthGetUser) {
    logger.error('KOauth not initialized');
    throw ApiErrors.unauthorized('Authentication system not initialized');
  }

  // Check session authentication first
  const sessionUser = koauthGetUser(request);
  if (sessionUser) {
    return sessionUser;
  }

  // Check API key authentication
  const apiKeyUser = apiKeyUserMap.get(request);
  if (apiKeyUser) {
    return apiKeyUser;
  }

  logger.warn('User not authenticated', {
    method: request.method,
    url: request.url,
  });
  throw ApiErrors.unauthorized('Authentication required');
}

/**
 * Get optional authenticated user from request
 * Returns null if not authenticated (for endpoints that work with/without auth)
 * Checks both session-based and API key authentication
 */
export function getOptionalUser(request: FastifyRequest): { id: string; email: string; sessionId?: string } | null {
  if (!koauthGetUser) {
    return null;
  }

  // Check session authentication first
  const sessionUser = koauthGetUser(request);
  if (sessionUser) {
    return sessionUser;
  }

  // Check API key authentication
  const apiKeyUser = apiKeyUserMap.get(request);
  if (apiKeyUser) {
    return apiKeyUser;
  }

  return null;
}
