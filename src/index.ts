/**
 * KURA Notes - Main Application Entry Point
 *
 * Initializes the application and all services
 */

import { config, printConfig } from './config/index.js';
import { getDatabaseService } from './services/database/index.js';
import {
  logger,
  logStartup,
  logShutdown,
  logServiceInit,
  logServiceReady,
  logServiceError,
} from './utils/logger.js';

const version = '0.1.0';
const appName = 'KURA Notes';

/**
 * Initialize application
 */
async function init() {
  // Log startup
  logStartup(appName, version);

  // Print configuration (safe - secrets are masked)
  printConfig(config);

  logger.info('-'.repeat(80));
  logger.info('📦 Initializing services...');
  logger.info('-'.repeat(80));

  try {
    // Initialize database
    logServiceInit('Database');
    const db = getDatabaseService(config.databaseUrl);

    // Check database health
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

    // TODO: Task 1.6 - Set up Fastify server
    // TODO: Task 2.1 - Initialize ChromaDB connection

    logger.info('='.repeat(80));
    logger.info(`✅ ${appName} v${version} - Ready for development`);
    logger.info('='.repeat(80));
  } catch (error) {
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
  const shutdown = (signal: string) => {
    logShutdown(appName, `Received ${signal}`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    logShutdown(appName, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
    logShutdown(appName, 'Unhandled promise rejection');
    process.exit(1);
  });
}

// Set up shutdown handlers
setupShutdownHandlers();

// Start application
init().catch((error) => {
  logger.error('Fatal error during initialization', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

export { version, appName };
