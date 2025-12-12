/**
 * KURA Notes - Authentication Middleware
 *
 * OAuth 2.0 based authentication using KOauth
 * Supports:
 * - OAuth sessions (browser) via session cookies
 * - OAuth access tokens (Bearer tokens, type: "access_token")
 * - API keys (Bearer tokens, type: "api_key" - JWT or legacy opaque)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';
import { validateApiKey } from '../../lib/koauth-client.js';
import { refreshOAuthToken } from '../routes/oauth.js';
import { verifyJWT, isJWT } from '../../lib/jwt-verifier.js';

// KOauth will be initialized in server.ts and provide these functions
// Import will be added after KOauth initialization
let koauthGetUser: ((request: FastifyRequest) => { id: string; email: string; sessionId?: string } | null) | null = null;

// Store users authenticated via API keys
const apiKeyUserMap = new WeakMap<FastifyRequest, { id: string; email: string } | null>();

/**
 * Verify JWT token with RS256 signature and claim validation
 * SECURITY: This now performs proper signature verification using KOauth's public key
 */
async function verifyJwtToken(token: string): Promise<{ id: string; email: string } | null> {
  const verifiedUser = await verifyJWT(token);

  if (!verifiedUser) {
    return null;
  }

  return {
    id: verifiedUser.id,
    email: verifiedUser.email,
  };
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
  const urlParts = request.url.split('?');
  const urlPath = urlParts[0] ?? ''; // Remove query params
  if (STATIC_FILE_EXTENSIONS.some(ext => urlPath.endsWith(ext)) || urlPath === '/') {
    return;
  }

  // Skip authentication for auth-related routes and OAuth callback
  if (urlPath.startsWith('/auth') || urlPath.startsWith('/oauth')) {
    return;
  }

  // Skip authentication for MCP message endpoint (used by SSE transport)
  // This endpoint proxies to the MCP server and handles its own authentication
  if (urlPath === '/message' || urlPath === '/mcp/message') {
    return;
  }

  // Skip authentication for OAuth discovery endpoints
  // These redirect to KOauth or return metadata, so they need to be public
  // Only match exact paths we've registered (security: prevent matching unintended paths)
  if (
    urlPath === '/.well-known/oauth-authorization-server' ||
    urlPath === '/.well-known/oauth-authorization-server/mcp' ||
    urlPath === '/.well-known/oauth-protected-resource'
  ) {
    return;
  }

  // 1. Try OAuth session authentication (highest priority)
  if (request.session?.accessToken) {
    const payload = await verifyJwtToken(request.session.accessToken);

    if (payload) {
      // Token is valid
      const userId = payload.id;
      const userEmail = payload.email;

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
    } else {
      // Token expired or invalid - try refresh
      if (request.session.refreshToken) {
        logger.debug('Access token invalid, attempting refresh');

        const newTokens = await refreshOAuthToken(request.session.refreshToken);
        if (newTokens) {
          // Update session with new tokens
          request.session.accessToken = newTokens.access_token;
          request.session.refreshToken = newTokens.refresh_token;

          // Verify new access token
          const newPayload = await verifyJwtToken(newTokens.access_token);
          if (newPayload) {
            const userId = newPayload.id;
            const userEmail = newPayload.email;

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

  // 3. Try Bearer token authentication (OAuth access tokens or API keys)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      // Check if token is a JWT (OAuth access token or JWT-based API key)
      if (isJWT(token)) {
        // JWT token - verify signature and accept both access_token and api_key types
        const verifiedUser = await verifyJWT(token);

        if (verifiedUser) {
          // Store authenticated user in WeakMap for later retrieval
          apiKeyUserMap.set(request, {
            id: verifiedUser.id,
            email: verifiedUser.email,
          });

          logger.debug('Bearer token authentication successful', {
            method: request.method,
            url: request.url,
            userId: verifiedUser.id,
            email: verifiedUser.email,
            tokenType: verifiedUser.tokenType,
          });
          return;
        }
      } else {
        // Not a JWT - must be legacy opaque API key
        const apiKeyUser = await validateApiKey(token);

        if (apiKeyUser) {
          // Store API key user in WeakMap for later retrieval
          apiKeyUserMap.set(request, apiKeyUser);

          logger.debug('Legacy API key authentication successful', {
            method: request.method,
            url: request.url,
            userId: apiKeyUser.id,
            email: apiKeyUser.email,
          });
          return;
        }
      }
    } catch (error) {
      logger.warn('Bearer token validation error', {
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
