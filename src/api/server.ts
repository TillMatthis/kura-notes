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
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger, responseLogger } from './middleware/requestLogger.js';
import { authMiddleware, setKoauthGetUser, getOptionalUser } from './middleware/auth.js';
import { initKOauth, getUser as koauthGetUser } from '../lib/koauth-client.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCaptureRoutes } from './routes/capture.js';
import { registerContentRoutes } from './routes/content.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerTagRoutes } from './routes/tags.js';
import { registerStatsRoutes } from './routes/stats.js';
import { getFileStorageService } from '../services/fileStorage.js';
import { getDatabaseService } from '../services/database/database.service.js';
import { getEmbeddingService } from '../services/embeddingService.js';
import { getVectorStoreService } from '../services/vectorStore.js';
import { EmbeddingPipelineService } from '../services/embeddingPipeline.js';
import { getTagService } from '../services/tagService.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Initialize KOauth authentication
  logger.info('Initializing KOauth authentication...', {
    koauthUrl: config.koauthUrl,
    timeout: config.koauthTimeout,
  });

  try {
    await initKOauth(fastify, {
      baseUrl: config.koauthUrl,
      timeout: config.koauthTimeout,
    });

    // Set the KOauth getUser function in auth middleware
    setKoauthGetUser(koauthGetUser);

    logger.info('KOauth initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize KOauth', { error });
    throw new Error('KOauth initialization failed. Ensure auth.tillmaessen.de is accessible.');
  }

  // Register plugins
  await registerPlugins(fastify);

  // Register hooks
  registerHooks(fastify);

  // Register routes
  await registerRoutes(fastify);

  // Set error handler
  fastify.setErrorHandler(errorHandler);

  // Set not found handler
  fastify.setNotFoundHandler(async (request, reply) => {
    // Check if request accepts HTML (browser request)
    const acceptsHtml = request.headers.accept?.includes('text/html');

    if (acceptsHtml && !request.url.startsWith('/api/')) {
      // Serve 404 HTML page for browser requests
      return reply.status(404).type('text/html').sendFile('404.html');
    }

    // Send JSON response for API requests
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

  // Cookie plugin (for session management)
  await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'kura-notes-cookie-secret', // Used for signing cookies
    parseOptions: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
    },
  });

  logger.info('Cookie plugin configured');

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

  // Static file serving (for web interface)
  const publicPath = path.join(__dirname, '..', '..', 'public');
  await fastify.register(fastifyStatic, {
    root: publicPath,
    prefix: '/', // Serve files at root
  });

  logger.info('Static file serving configured', { publicPath });

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

  // Get service instances
  const db = getDatabaseService();
  const fileStorage = getFileStorageService();
  const embeddingService = getEmbeddingService();
  const vectorStore = getVectorStoreService();
  const tagService = getTagService(db);

  // Create embedding pipeline service
  const embeddingPipeline = new EmbeddingPipelineService(
    embeddingService,
    vectorStore,
    db
  );

  // Root route - redirect to login if not authenticated
  fastify.get('/', async (request, reply) => {
    const user = getOptionalUser(request);

    if (!user) {
      return reply.redirect('/auth/login.html');
    }

    return reply.sendFile('index.html');
  });

  // Health check routes
  await registerHealthRoutes(fastify);

  // Authentication routes (Task 4.7)
  await registerAuthRoutes(fastify);

  // Content capture routes (Task 1.7 + Task 2.3)
  await registerCaptureRoutes(fastify, fileStorage, embeddingPipeline);

  // Content retrieval routes (Task 1.10 + Task 1.12)
  await registerContentRoutes(fastify, db, fileStorage, vectorStore);

  // Search routes (Task 2.4)
  await registerSearchRoutes(fastify, db, embeddingService, vectorStore);

  // Tag routes (Task 3.4)
  await registerTagRoutes(fastify, tagService);

  // Stats routes (Task 3.7)
  await registerStatsRoutes(fastify);

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
