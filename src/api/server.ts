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
import session from '@fastify/session';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger, responseLogger } from './middleware/requestLogger.js';
import { authMiddleware, setKoauthGetUser, getOptionalUser } from './middleware/auth.js';
import { initKOauth, getUser as koauthGetUser } from '../lib/koauth-client.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOAuthRoutes } from './routes/oauth.js';
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

    // Check if OAuth 2.0 is configured as fallback
    const hasOAuthConfigured = config.oauthClientId && config.oauthClientSecret && config.oauthRedirectUri;

    if (hasOAuthConfigured) {
      logger.warn('KOauth unavailable, but OAuth 2.0 is configured. Server will continue with OAuth only.');
      logger.info('Users must use OAuth 2.0 authentication via /auth/login');
    } else {
      logger.error('Neither KOauth nor OAuth 2.0 is properly configured');
      throw new Error(
        'Authentication initialization failed. Either:\n' +
        '  1. Ensure KOauth service at ' + config.koauthUrl + ' is accessible, OR\n' +
        '  2. Configure OAuth 2.0 by setting OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, and OAUTH_REDIRECT_URI'
      );
    }
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

  // Cookie plugin (required for session management)
  await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'kura-notes-cookie-secret', // Used for signing cookies
    parseOptions: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
    },
  });

  logger.info('Cookie plugin configured');

  // Session plugin (for OAuth token storage)
  await fastify.register(session, {
    secret: process.env.SESSION_SECRET || process.env.COOKIE_SECRET || 'kura-notes-session-secret-change-in-production',
    cookie: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    saveUninitialized: false,
    rolling: true, // Extend session on each request
  });

  logger.info('Session plugin configured');

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

  // OAuth 2.0 routes
  await registerOAuthRoutes(fastify);

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

  // MCP message endpoint - proxy to MCP server
  // This endpoint is used by the SSE transport to receive messages from the client
  // The MCP server handles the actual message processing
  fastify.post('/message', async (request, reply) => {
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://mcp:3001';
    const queryString = request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : '';
    const targetUrl = `${mcpServerUrl}/message${queryString}`;

    try {
      // Prepare headers for forwarding
      const headers: Record<string, string> = {
        'Content-Type': (request.headers['content-type'] as string) || 'application/json',
      };

      // Forward Authorization header if present
      if (request.headers.authorization) {
        headers['Authorization'] = request.headers.authorization as string;
      }

      // Forward other relevant headers
      if (request.headers['user-agent']) {
        headers['User-Agent'] = request.headers['user-agent'] as string;
      }

      // Prepare request body
      let body: string | undefined;
      if (request.body) {
        if (typeof request.body === 'string') {
          body = request.body;
        } else {
          body = JSON.stringify(request.body);
        }
      }

      // Forward the request to the MCP server
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body,
      });

      // Forward the response status and headers
      reply.status(response.status);
      
      const contentType = response.headers.get('content-type');
      if (contentType) {
        reply.type(contentType);
      }

      // Forward the response body
      const responseBody = await response.text();
      return reply.send(responseBody || undefined);
    } catch (error) {
      logger.error('Error proxying request to MCP server', {
        error: error instanceof Error ? error.message : String(error),
        targetUrl,
        method: request.method,
      });
      return reply.status(502).send({
        error: 'BadGateway',
        code: 'BAD_GATEWAY',
        message: 'Failed to connect to MCP server',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // MCP SSE endpoint - proxy to MCP server
  // This endpoint handles SSE connections from Claude Desktop/Mobile
  fastify.get('/mcp/sse', async (request, reply) => {
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://mcp:3001';
    const targetUrl = `${mcpServerUrl}/sse`;

    try {
      // Prepare headers for forwarding
      const headers: Record<string, string> = {};

      // Forward Authorization header if present
      if (request.headers.authorization) {
        headers['Authorization'] = request.headers.authorization as string;
      }

      // Forward Accept header for SSE
      if (request.headers.accept) {
        headers['Accept'] = request.headers.accept as string;
      } else {
        headers['Accept'] = 'text/event-stream';
      }

      // Forward other relevant headers
      if (request.headers['user-agent']) {
        headers['User-Agent'] = request.headers['user-agent'] as string;
      }

      // Forward query parameters
      const queryString = request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : '';
      const fullTargetUrl = `${targetUrl}${queryString}`;

      // Forward the request to the MCP server
      const response = await fetch(fullTargetUrl, {
        method: 'GET',
        headers,
      });

      // Forward the response status and headers
      reply.status(response.status);
      
      // Forward all response headers (important for SSE)
      response.headers.forEach((value, key) => {
        // Skip hop-by-hop headers that shouldn't be forwarded
        const hopByHopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 
          'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'];
        if (!hopByHopHeaders.includes(key.toLowerCase())) {
          reply.header(key, value);
        }
      });

      // Stream the response body for SSE using Node.js streams
      if (response.body) {
        // Convert Web Streams API to Node.js stream for Fastify
        const reader = response.body.getReader();
        
        const nodeStream = new Readable({
          read() {
            // This will be called by Fastify when it needs more data
          },
        });

        // Read from the fetch response and write to the Node.js stream
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                nodeStream.push(null); // End the stream
                break;
              }
              nodeStream.push(Buffer.from(value));
            }
          } catch (error) {
            nodeStream.destroy(error instanceof Error ? error : new Error(String(error)));
          }
        })();

        return reply.send(nodeStream);
      }

      return reply.send();
    } catch (error) {
      logger.error('Error proxying SSE request to MCP server', {
        error: error instanceof Error ? error.message : String(error),
        targetUrl,
        method: request.method,
      });
      return reply.status(502).send({
        error: 'BadGateway',
        code: 'BAD_GATEWAY',
        message: 'Failed to connect to MCP server',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Handle Claude Desktop's attempt to access resource at discovery path
  // Some OAuth clients try to access the resource at /.well-known/oauth-protected-resource/mcp/sse
  fastify.get('/.well-known/oauth-protected-resource/mcp/sse', async (request, reply) => {
    // Redirect to the actual MCP SSE endpoint
    return reply.redirect(302, '/mcp/sse');
  });

  // OPTIONS handler for CORS preflight on MCP SSE endpoint
  fastify.options('/mcp/sse', async (_request, reply) => {
    return reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
      .code(204)
      .send();
  });

  // OPTIONS handler for discovery path variant
  fastify.options('/.well-known/oauth-protected-resource/mcp/sse', async (_request, reply) => {
    return reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
      .code(204)
      .send();
  });

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
