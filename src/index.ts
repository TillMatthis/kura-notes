/**
 * KURA Notes - Main Application Entry Point
 *
 * Initializes the application and all services
 */

import { config, printConfig } from './config/index.js';
import { getDatabaseService } from './services/database/index.js';
import { getFileStorageService } from './services/fileStorage.js';
import { getEmbeddingService } from './services/embeddingService.js';
import { getThumbnailService } from './services/thumbnailService.js';
import { PdfService } from './services/pdfService.js';
import { getStatsService } from './services/statsService.js';
import {
  logger,
  logStartup,
  logShutdown,
  logServiceInit,
  logServiceReady,
  logServiceError,
} from './utils/logger.js';
import { createServer, startServer, stopServer } from './api/server.js';
import type { FastifyInstance } from 'fastify';

const version = '0.1.0';
const appName = 'KURA Notes';

let fastifyInstance: FastifyInstance | null = null;

/**
 * Initialize application
 */
async function init() {
  console.log('🚀 Starting KURA Notes...');
  console.log('Version:', version);
  console.log('Node version:', process.version);
  console.log('Platform:', process.platform);
  console.log('');

  // Log startup
  logStartup(appName, version);

  // Print configuration (safe - secrets are masked)
  printConfig(config);

  logger.info('-'.repeat(80));
  logger.info('📦 Initializing services...');
  logger.info('-'.repeat(80));

  try {
    // Initialize database
    console.log('📊 Initializing database...');
    logServiceInit('Database');
    const db = getDatabaseService(config.databaseUrl);

    // Check database health
    console.log('  ↳ Running database health check...');
    const isHealthy = db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }

    // Get and print database stats
    const stats = db.getStats();
    logServiceReady('Database', {
      path: stats.databasePath,
      schemaVersion: stats.schemaVersion?.version || 'unknown',
      totalContent: stats.totalContent,
      contentByType: stats.byType,
    });
    console.log('✓ Database initialized');
    console.log('');

    // Initialize thumbnail service
    console.log('🖼️  Initializing thumbnail service...');
    logServiceInit('Thumbnail Service');
    const thumbnailService = getThumbnailService({
      baseDirectory: config.storageBasePath,
      thumbnailDirectory: 'thumbnails',
      maxWidth: 300,
      maxHeight: 300,
      quality: 80,
    });
    logServiceReady('Thumbnail Service', {
      maxSize: '300x300px',
      quality: 80,
    });
    console.log('✓ Thumbnail service initialized');
    console.log('');

    // Initialize PDF service
    console.log('📄 Initializing PDF service...');
    logServiceInit('PDF Service');
    const pdfService = PdfService.getInstance();
    logServiceReady('PDF Service', {
      status: 'available',
    });
    console.log('✓ PDF service initialized');
    console.log('');

    // Initialize file storage service
    console.log('💾 Initializing file storage...');
    logServiceInit('File Storage');
    getFileStorageService(
      {
        baseDirectory: config.storageBasePath,
        logger,
      },
      db,
      thumbnailService,
      pdfService
    );
    logServiceReady('File Storage', {
      baseDirectory: config.storageBasePath,
      thumbnailsEnabled: true,
      pdfMetadataEnabled: true,
    });
    console.log('✓ File storage initialized');
    console.log('');

    // Initialize embedding service
    console.log('🔍 Initializing embedding service...');
    logServiceInit('Embedding Service');
    const embeddingService = getEmbeddingService();
    if (embeddingService.isAvailable()) {
      logServiceReady('Embedding Service', {
        model: config.openaiEmbeddingModel,
        status: 'available',
      });
      console.log('✓ Embedding service initialized (available)');
    } else {
      logger.warn('⚠️  Embedding Service initialized without API key', {
        status: 'unavailable',
        reason: 'OPENAI_API_KEY not configured',
        impact: 'Vector embeddings will not be generated',
      });
      console.log('⚠️  Embedding service initialized (unavailable - no API key)');
    }
    console.log('');

    // Initialize stats service
    console.log('📈 Initializing stats service...');
    logServiceInit('Stats Service');
    getStatsService(config.storageBasePath);
    logServiceReady('Stats Service', {
      cacheTTL: '5 minutes',
      status: 'available',
    });
    console.log('✓ Stats service initialized');
    console.log('');

    // Initialize Fastify server
    console.log('🌐 Creating Fastify server...');
    logServiceInit('API Server');
    fastifyInstance = await createServer();
    logServiceReady('API Server', {
      port: config.apiPort,
      cors: config.corsOrigin,
    });
    console.log('✓ Fastify server created');
    console.log('');

    // Start the server
    console.log('🚀 Starting server on port', config.apiPort, '...');
    await startServer(fastifyInstance);
    console.log('✓ Server listening on port', config.apiPort);

    // TODO: Task 2.1 - Initialize ChromaDB connection

    logger.info('='.repeat(80));
    logger.info(`✅ ${appName} v${version} - Ready`);
    logger.info(`🌐 API available at: http://localhost:${config.apiPort}`);
    logger.info(`🏥 Health check: http://localhost:${config.apiPort}/api/health`);
    logger.info('='.repeat(80));
    console.log('');
    console.log('✅ ALL SYSTEMS READY');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ FATAL ERROR DURING INITIALIZATION');
    console.error('='.repeat(80));
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    console.error('='.repeat(80));
    console.error('');

    logger.error('='.repeat(80));
    logServiceError('Application', error as Error);
    logger.error('='.repeat(80));
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
function setupShutdownHandlers() {
  const shutdown = async (signal: string) => {
    logShutdown(appName, `Received ${signal}`);

    // Close Fastify server gracefully
    if (fastifyInstance) {
      try {
        await stopServer(fastifyInstance);
      } catch (error) {
        logger.error('Error during server shutdown', { error });
      }
    }

    // Close database connection
    try {
      const db = getDatabaseService();
      db.close();
    } catch (error) {
      logger.error('Error closing database', { error });
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('');
    console.error('❌ UNCAUGHT EXCEPTION');
    console.error('='.repeat(80));
    console.error('Error:', error);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
    console.error('');

    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    logShutdown(appName, 'Uncaught exception');
    await shutdown('uncaughtException');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('');
    console.error('❌ UNHANDLED PROMISE REJECTION');
    console.error('='.repeat(80));
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    if (reason instanceof Error) {
      console.error('Message:', reason.message);
      console.error('Stack:', reason.stack);
    }
    console.error('='.repeat(80));
    console.error('');

    logger.error('Unhandled promise rejection', { reason, promise });
    logShutdown(appName, 'Unhandled promise rejection');
    await shutdown('unhandledRejection');
    process.exit(1);
  });
}

// Set up shutdown handlers
setupShutdownHandlers();

// Start application
init().catch((error) => {
  console.error('');
  console.error('❌ UNCAUGHT ERROR IN INIT');
  console.error('='.repeat(80));
  console.error('Error:', error);
  if (error instanceof Error) {
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
  }
  console.error('='.repeat(80));
  console.error('');

  logger.error('Fatal error during initialization', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

export { version, appName };
