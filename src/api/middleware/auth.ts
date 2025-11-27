/**
 * KURA Notes - Authentication Middleware
 *
 * OAuth 2.0 based authentication using KOauth
 * Supports both OAuth sessions (browser) and API keys (programmatic access)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';
import { validateApiKey } from '../../lib/koauth-client.js';
import { refreshOAuthToken } from '../routes/oauth.js';

// KOauth will be initialized in server.ts and provide these functions
// Import will be added after KOauth initialization
let koauthGetUser: ((request: FastifyRequest) => { id: string; email: string; sessionId?: string } | null) | null = null;

// Store users authenticated via API keys
const apiKeyUserMap = new WeakMap<FastifyRequest, { id: string; email: string } | null>();

/**
 * Verify and decode JWT token
 */
function verifyJwtToken(token: string): { sub?: string; userId?: string; email?: string; exp?: number } | null {
  try {
    // Decode JWT without verification (KOauth already verified it)
    // We just need to check expiration and extract user info
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as { sub?: string; userId?: string; email?: string; exp?: number };

    // Check if token is expired
    if (payload.exp && payload.exp < Date.now() / 1000) {
      logger.debug('JWT token expired', { exp: payload.exp, now: Date.now() / 1000 });
      return null;
    }

    return payload;
  } catch (error) {
    logger.error('Error verifying JWT token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

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
 * Authentication middleware using OAuth 2.0 and API keys
 * Priority: OAuth session -> Legacy session -> API key
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
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

  // Skip authentication for auth-related routes and OAuth callback
  if (urlPath.startsWith('/auth') || urlPath.startsWith('/oauth')) {
    return;
  }

  // 1. Try OAuth session authentication (highest priority)
  if (request.session?.accessToken) {
    const payload = verifyJwtToken(request.session.accessToken);

    if (payload) {
      // Token is valid
      const userId = payload.sub || payload.userId;
      const userEmail = payload.email;

      if (userId && userEmail) {
        // Store user in session for getAuthenticatedUser
        request.session.user = {
          id: userId,
          email: userEmail,
        };

        logger.debug('OAuth session authentication successful', {
          method: request.method,
          url: request.url,
          userId,
          email: userEmail,
        });
        return;
      }
    } else {
      // Token expired - try refresh
      if (request.session.refreshToken) {
        logger.debug('Access token expired, attempting refresh');

        const newTokens = await refreshOAuthToken(request.session.refreshToken);
        if (newTokens) {
          // Update session with new tokens
          request.session.accessToken = newTokens.access_token;
          request.session.refreshToken = newTokens.refresh_token;

          // Decode new access token
          const newPayload = verifyJwtToken(newTokens.access_token);
          if (newPayload) {
            const userId = newPayload.sub || newPayload.userId;
            const userEmail = newPayload.email;

            if (userId && userEmail) {
              request.session.user = {
                id: userId,
                email: userEmail,
              };

              logger.info('OAuth token refreshed successfully', {
                userId,
                email: userEmail,
              });
              return;
            }
          }
        }

        // Refresh failed - clear session and redirect to login
        logger.warn('OAuth token refresh failed, clearing session');
        request.session.destroy();

        // For API requests, return 401
        if (urlPath.startsWith('/api/')) {
          throw ApiErrors.unauthorized('Session expired, please login again');
        }

        // For browser requests, redirect to login
        return reply.redirect('/auth/login');
      }

      // No refresh token - clear session
      request.session.destroy();
    }
  }

  // 2. Try legacy KOauth session (backward compatibility)
  if (koauthGetUser) {
    const sessionUser = koauthGetUser(request);

    if (sessionUser) {
      logger.debug('Legacy session authentication successful', {
        method: request.method,
        url: request.url,
        userId: sessionUser.id,
        email: sessionUser.email,
      });
      return;
    }
  }

  // 3. Try API key authentication (for programmatic access)
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
    hasSession: !!request.session,
  });

  // For API requests, return 401
  if (urlPath.startsWith('/api/')) {
    throw ApiErrors.unauthorized('Authentication required');
  }

  // For browser requests, redirect to login
  return reply.redirect('/auth/login');
}

/**
 * Get authenticated user from request
 * Helper function for routes to extract user information
 * Checks OAuth session, legacy session, and API key authentication
 * @throws ApiError if user is not authenticated
 */
export function getAuthenticatedUser(request: FastifyRequest): { id: string; email: string; sessionId?: string } {
  // Check OAuth session first
  if (request.session?.user) {
    return request.session.user;
  }

  // Check legacy KOauth session
  if (koauthGetUser) {
    const sessionUser = koauthGetUser(request);
    if (sessionUser) {
      return sessionUser;
    }
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
 * Checks OAuth session, legacy session, and API key authentication
 */
export function getOptionalUser(request: FastifyRequest): { id: string; email: string; sessionId?: string } | null {
  // Check OAuth session first
  if (request.session?.user) {
    return request.session.user;
  }

  // Check legacy KOauth session
  if (koauthGetUser) {
    const sessionUser = koauthGetUser(request);
    if (sessionUser) {
      return sessionUser;
    }
  }

  // Check API key authentication
  const apiKeyUser = apiKeyUserMap.get(request);
  if (apiKeyUser) {
    return apiKeyUser;
  }

  return null;
}
