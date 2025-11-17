/**
 * KURA Notes - Configuration Service
 *
 * Loads and validates environment variables
 * Provides typed configuration object
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load .env file if it exists
dotenvConfig();

/**
 * Application configuration interface
 */
export interface Config {
  // Application
  nodeEnv: 'development' | 'production' | 'test';
  apiPort: number;
  apiKey: string;

  // Database
  databaseUrl: string;

  // Vector Store
  vectorStoreUrl: string;
  vectorDbKey?: string;

  // OpenAI
  openaiApiKey?: string;
  openaiEmbeddingModel: string;

  // Storage
  storageBasePath: string;
  maxFileSize: number;

  // Logging
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logDir: string;

  // CORS
  corsOrigin: string;

  // TLS (optional)
  tlsCertPath?: string;
  tlsKeyPath?: string;
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];

  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }

  return value;
}

/**
 * Get optional environment variable
 */
function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Parse integer from environment variable
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer`);
  }

  return parsed;
}

/**
 * Validate and normalize database path
 */
function normalizeDatabasePath(path: string): string {
  // If path is relative, resolve it from the project root
  if (!path.startsWith('/')) {
    return resolve(process.cwd(), path);
  }
  return path;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const nodeEnv = (getEnv('NODE_ENV', 'development') as Config['nodeEnv']);

  const config: Config = {
    // Application
    nodeEnv,
    apiPort: getEnvInt('API_PORT', 3000),
    apiKey: getEnv('API_KEY', 'dev-api-key-change-in-production'),

    // Database
    databaseUrl: normalizeDatabasePath(
      getEnv('DATABASE_URL', './data/metadata/knowledge.db')
    ),

    // Vector Store
    vectorStoreUrl: getEnv('VECTOR_STORE_URL', 'http://localhost:8000'),
    vectorDbKey: getOptionalEnv('VECTOR_DB_KEY'),

    // OpenAI
    openaiApiKey: getOptionalEnv('OPENAI_API_KEY'),
    openaiEmbeddingModel: getEnv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),

    // Storage
    storageBasePath: getEnv('STORAGE_BASE_PATH', './data/content'),
    maxFileSize: getEnvInt('MAX_FILE_SIZE', 52428800), // 50MB default

    // Logging
    logLevel: (getEnv('LOG_LEVEL', 'info') as Config['logLevel']),
    logDir: getEnv('LOG_DIR', './data/logs'),

    // CORS
    corsOrigin: getEnv('CORS_ORIGIN', '*'),

    // TLS (optional)
    tlsCertPath: getOptionalEnv('TLS_CERT_PATH'),
    tlsKeyPath: getOptionalEnv('TLS_KEY_PATH'),
  };

  // Validate configuration in production
  if (nodeEnv === 'production') {
    validateProductionConfig(config);
  }

  return config;
}

/**
 * Validate production configuration
 * Ensures critical settings are properly configured
 */
function validateProductionConfig(config: Config): void {
  const errors: string[] = [];

  // API key should be changed from default
  if (config.apiKey === 'dev-api-key-change-in-production') {
    errors.push('API_KEY must be changed from default value in production');
  }

  // API key should be strong enough
  if (config.apiKey.length < 32) {
    errors.push('API_KEY should be at least 32 characters long in production');
  }

  // OpenAI API key should be set if using embeddings
  if (!config.openaiApiKey) {
    console.warn(
      '⚠️  OPENAI_API_KEY is not set. Vector embeddings will not work without it.'
    );
  }

  // CORS should be restricted
  if (config.corsOrigin === '*') {
    console.warn(
      '⚠️  CORS_ORIGIN is set to "*" (allow all). Consider restricting in production.'
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Production configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}

/**
 * Print configuration (safe - hides sensitive values)
 */
export function printConfig(config: Config): void {
  const safeToPrint = {
    nodeEnv: config.nodeEnv,
    apiPort: config.apiPort,
    apiKey: maskSecret(config.apiKey),
    databaseUrl: config.databaseUrl,
    vectorStoreUrl: config.vectorStoreUrl,
    vectorDbKey: maskSecret(config.vectorDbKey),
    openaiApiKey: maskSecret(config.openaiApiKey),
    openaiEmbeddingModel: config.openaiEmbeddingModel,
    storageBasePath: config.storageBasePath,
    maxFileSize: `${Math.round(config.maxFileSize / 1024 / 1024)}MB`,
    logLevel: config.logLevel,
    logDir: config.logDir,
    corsOrigin: config.corsOrigin,
    tlsEnabled: !!(config.tlsCertPath && config.tlsKeyPath),
  };

  console.log('📋 Configuration loaded:');
  console.log(JSON.stringify(safeToPrint, null, 2));
}

/**
 * Mask secret values for safe printing
 */
function maskSecret(value: string | undefined): string {
  if (!value) {
    return '<not set>';
  }

  if (value.length <= 8) {
    return '***';
  }

  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

/**
 * Export singleton config instance
 */
export const config = loadConfig();
