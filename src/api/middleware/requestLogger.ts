/**
 * KURA Notes - Request Logger Middleware
 *
 * Logs all incoming HTTP requests with structured data
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';

/**
 * Store start times for requests
 */
const requestStartTimes = new Map<string, number>();

/**
 * Request logger hook for Fastify
 * Logs request details before processing
 */
export async function requestLogger(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();

  // Store start time for this request
  requestStartTimes.set(request.id, startTime);

  // Log request
  logger.info('Incoming request', {
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  });
}

/**
 * Response logger hook for Fastify
 * Logs response details and adds response time header
 */
export async function responseLogger(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = requestStartTimes.get(request.id) || Date.now();
  const responseTime = Date.now() - startTime;

  // Add response time header
  reply.header('X-Response-Time', `${responseTime}ms`);

  // Log response
  logger.info('Request completed', {
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: `${responseTime}ms`,
  });

  // Clean up
  requestStartTimes.delete(request.id);
}

/**
 * Create a child logger for a specific request
 * Useful for tracking related log entries
 */
export function createRequestLogger(request: FastifyRequest) {
  return logger.child({
    requestId: request.id,
    method: request.method,
    url: request.url,
  });
}
