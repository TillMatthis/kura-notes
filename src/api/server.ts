/**
 * KURA Notes - Fastify Server Setup
 *
 * Configures and creates the Fastify server instance with:
 * - CORS support
 * - Error handling
 * - Request logging
 * - Authentication
 * - Request validation
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger, responseLogger } from './middleware/requestLogger.js';
import { authMiddleware } from './middleware/auth.js';
import { registerHealthRoutes } from './routes/health.js';

/**
 * Create and configure Fastify server
 */
export async function createServer(): Promise<FastifyInstance> {
  logger.info('Creating Fastify server...');

  // Create Fastify instance
  const fastify = Fastify({
    logger: false, // We use our own Winston logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: true, // We handle this with our middleware
    bodyLimit: config.maxFileSize,
    trustProxy: true, // Trust proxy headers (X-Forwarded-For, etc.)
  });

  // Register plugins
  await registerPlugins(fastify);

  // Register hooks
  registerHooks(fastify);

  // Register routes
  await registerRoutes(fastify);

  // Set error handler
  fastify.setErrorHandler(errorHandler);

  // Set not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'NotFound',
      code: 'NOT_FOUND',
      message: `Route ${request.method}:${request.url} not found`,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  });

  logger.info('Fastify server configured successfully');

  return fastify;
}

/**
 * Register Fastify plugins
 */
async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  logger.debug('Registering Fastify plugins...');

  // CORS plugin
  await fastify.register(cors, {
    origin: getCorsOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  logger.info('CORS configured', { origin: config.corsOrigin });

  // Multipart plugin (for file uploads)
  await fastify.register(multipart, {
    limits: {
      fileSize: config.maxFileSize,
      files: 1, // One file per request for now
    },
  });

  logger.info('Multipart configured', {
    maxFileSize: `${Math.round(config.maxFileSize / 1024 / 1024)}MB`,
  });

  logger.debug('Fastify plugins registered successfully');
}

/**
 * Get CORS origin configuration
 * Handles both single origin and multiple origins
 */
function getCorsOrigin(): string | string[] | boolean {
  const origin = config.corsOrigin;

  if (origin === '*') {
    return true; // Allow all origins
  }

  if (origin.includes(',')) {
    // Multiple origins
    return origin.split(',').map((o) => o.trim());
  }

  // Single origin
  return origin;
}

/**
 * Register Fastify hooks
 */
function registerHooks(fastify: FastifyInstance): void {
  logger.debug('Registering Fastify hooks...');

  // Request logging
  fastify.addHook('onRequest', requestLogger);

  // Authentication
  fastify.addHook('onRequest', authMiddleware);

  // Response logging
  fastify.addHook('onResponse', responseLogger);

  logger.debug('Fastify hooks registered successfully');
}

/**
 * Register all routes
 */
async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  logger.debug('Registering routes...');

  // Health check routes
  await registerHealthRoutes(fastify);

  // TODO: Task 1.7 - Register content capture routes
  // TODO: Task 1.10 - Register content retrieval routes
  // TODO: Task 2.4 - Register search routes

  logger.info('Routes registered successfully');
}

/**
 * Start the Fastify server
 */
export async function startServer(fastify: FastifyInstance): Promise<void> {
  try {
    const address = await fastify.listen({
      port: config.apiPort,
      host: '0.0.0.0', // Listen on all network interfaces
    });

    logger.info('🚀 Server listening', {
      address,
      port: config.apiPort,
      environment: config.nodeEnv,
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    throw error;
  }
}

/**
 * Stop the Fastify server gracefully
 */
export async function stopServer(fastify: FastifyInstance): Promise<void> {
  logger.info('Stopping server...');

  try {
    await fastify.close();
    logger.info('Server stopped successfully');
  } catch (error) {
    logger.error('Error stopping server', { error });
    throw error;
  }
}
