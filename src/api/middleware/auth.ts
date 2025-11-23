/**
 * KURA Notes - Authentication Middleware
 *
 * OAuth-based authentication using KOauth
 * Replaces the previous API key authentication system
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';

// KOauth will be initialized in server.ts and provide these functions
// Import will be added after KOauth initialization
let koauthGetUser: ((request: FastifyRequest) => { id: string; email: string; sessionId?: string } | null) | null = null;

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

  // Skip authentication for auth-related routes
  if (urlPath.startsWith('/auth')) {
    return;
  }

  // Check if KOauth is initialized
  if (!koauthGetUser) {
    logger.error('KOauth not initialized - authentication unavailable');
    throw ApiErrors.unauthorized('Authentication system not initialized');
  }

  // Get user from KOauth (handles sessions, API keys, and JWT tokens)
  const user = koauthGetUser(request);

  if (!user) {
    logger.warn('Authentication failed - no valid credentials', {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
    throw ApiErrors.unauthorized('Authentication required');
  }

  // Authentication successful - user is attached to request by KOauth
  logger.debug('Authentication successful', {
    method: request.method,
    url: request.url,
    userId: user.id,
    email: user.email,
  });
}

/**
 * Get authenticated user from request
 * Helper function for routes to extract user information
 * @throws ApiError if user is not authenticated
 */
export function getAuthenticatedUser(request: FastifyRequest): { id: string; email: string; sessionId?: string } {
  if (!koauthGetUser) {
    logger.error('KOauth not initialized');
    throw ApiErrors.unauthorized('Authentication system not initialized');
  }

  const user = koauthGetUser(request);

  if (!user) {
    logger.warn('User not authenticated', {
      method: request.method,
      url: request.url,
    });
    throw ApiErrors.unauthorized('Authentication required');
  }

  return user;
}

/**
 * Get optional authenticated user from request
 * Returns null if not authenticated (for endpoints that work with/without auth)
 */
export function getOptionalUser(request: FastifyRequest): { id: string; email: string; sessionId?: string } | null {
  if (!koauthGetUser) {
    return null;
  }

  return koauthGetUser(request);
}
