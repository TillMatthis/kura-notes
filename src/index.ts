/**
 * KURA Notes - Main Application Entry Point
 *
 * Initializes the application and all services
 */

import { config, printConfig } from './config/index.js';
import { getDatabaseService } from './services/database/index.js';

const version = '0.1.0';
const appName = 'KURA Notes';

/**
 * Initialize application
 */
async function init() {
  console.log('='.repeat(80));
  console.log(`🚀 ${appName} v${version} - Starting...`);
  console.log('='.repeat(80));

  // Print configuration (safe - secrets are masked)
  printConfig(config);

  console.log('\n' + '-'.repeat(80));
  console.log('📦 Initializing services...');
  console.log('-'.repeat(80));

  try {
    // Initialize database
    console.log('\n📊 Initializing database...');
    const db = getDatabaseService(config.databaseUrl);

    // Check database health
    const isHealthy = db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }

    // Get and print database stats
    const stats = db.getStats();
    console.log('✅ Database initialized successfully');
    console.log('   Path:', stats.databasePath);
    console.log('   Schema version:', stats.schemaVersion?.version || 'unknown');
    console.log('   Total content:', stats.totalContent);

    if (Object.keys(stats.byType).length > 0) {
      console.log('   Content by type:');
      Object.entries(stats.byType).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count}`);
      });
    }

    // TODO: Task 1.5 - Initialize logging and configuration
    // TODO: Task 1.6 - Set up Fastify server
    // TODO: Task 2.1 - Initialize ChromaDB connection

    console.log('\n' + '='.repeat(80));
    console.log(`✅ ${appName} v${version} - Ready for development`);
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ Initialization failed:', error);
    console.error('='.repeat(80));
    process.exit(1);
  }
}

// Start application
init().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { version, appName };
