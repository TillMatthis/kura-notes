/**
 * KURA Notes - Error Handler Middleware
 *
 * Centralized error handling for all API endpoints
 * Ensures consistent error response format
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ApiError, ErrorCode, type ApiErrorResponse } from '../types/errors.js';

/**
 * Global error handler for Fastify
 */
export async function errorHandler(
  error: FastifyError | ApiError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const path = request.url;
  const statusCode = ('statusCode' in error ? error.statusCode : 500) ?? 500;

  // Log error with context
  logger.error('API error', {
    error: error.message,
    stack: error.stack,
    path,
    method: request.method,
    statusCode,
  });

  // Check if request accepts HTML (browser request)
  const acceptsHtml = request.headers.accept?.includes('text/html');

  // For browser requests (non-API paths)
  if (acceptsHtml && !path.startsWith('/api/')) {
    // Handle authentication errors - redirect to login instead of 401
    if (statusCode === 401) {
      logger.debug('Redirecting unauthenticated browser request to login', { path });
      return reply.redirect('/auth/login.html');
    }

    // Serve 500 HTML page for server errors
    if (statusCode >= 500) {
      return reply.status(500).type('text/html').sendFile('500.html');
    }
  }

  // Handle ApiError (our custom errors)
  if (error instanceof ApiError) {
    await reply.status(error.statusCode).send(error.toResponse(path));
    return;
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    const response: ApiErrorResponse = {
      error: 'ValidationError',
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: error.validation,
      timestamp: new Date().toISOString(),
      path,
    };

    await reply.status(400).send(response);
    return;
  }

  // Handle Fastify errors
  if ('statusCode' in error && error.statusCode) {
    const response: ApiErrorResponse = {
      error: error.name || 'FastifyError',
      code: mapStatusCodeToErrorCode(error.statusCode),
      message: error.message,
      timestamp: new Date().toISOString(),
      path,
    };

    await reply.status(error.statusCode).send(response);
    return;
  }

  // Handle generic errors (500)
  const response: ApiErrorResponse = {
    error: 'InternalServerError',
    code: ErrorCode.INTERNAL_ERROR,
    message:
      process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : error.message,
    timestamp: new Date().toISOString(),
    path,
  };

  await reply.status(500).send(response);
}

/**
 * Map HTTP status code to error code
 */
function mapStatusCodeToErrorCode(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 413:
      return ErrorCode.FILE_TOO_LARGE;
    case 500:
      return ErrorCode.INTERNAL_ERROR;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.UNKNOWN_ERROR;
  }
}
