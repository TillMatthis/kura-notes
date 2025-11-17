/**
 * KURA Notes - Authentication Middleware
 *
 * API key-based authentication for securing endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';

/**
 * List of paths that don't require authentication
 */
const PUBLIC_PATHS = ['/api/health', '/health'];

/**
 * Authentication middleware
 * Checks for valid API key in Authorization header
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Skip authentication for public paths
  if (PUBLIC_PATHS.includes(request.url)) {
    return;
  }

  // Get API key from Authorization header
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing API key', {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
    throw ApiErrors.missingApiKey();
  }

  // Extract API key from Bearer token or direct value
  let apiKey: string;

  if (authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else {
    apiKey = authHeader;
  }

  // Validate API key
  if (apiKey !== config.apiKey) {
    logger.warn('Invalid API key attempt', {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
    throw ApiErrors.invalidApiKey();
  }

  // Authentication successful
  logger.debug('Authentication successful', {
    method: request.method,
    url: request.url,
  });
}

/**
 * Optional authentication middleware
 * Validates API key if present, but doesn't require it
 * Useful for endpoints that have different behavior for authenticated vs unauthenticated requests
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    // No authentication provided, continue without auth
    return;
  }

  // If auth is provided, validate it
  let apiKey: string;

  if (authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else {
    apiKey = authHeader;
  }

  if (apiKey !== config.apiKey) {
    logger.warn('Invalid API key in optional auth', {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
    throw ApiErrors.invalidApiKey();
  }

  logger.debug('Optional authentication successful', {
    method: request.method,
    url: request.url,
  });
}
