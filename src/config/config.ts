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
  apiKey: string; // Deprecated - kept for backward compatibility
  apiBaseUrl?: string; // Explicit base URL for API (for OAuth discovery, etc.)

  // KOauth Authentication
  koauthUrl: string;
  koauthTimeout: number;
  koauthIssuer?: string;  // JWT issuer (defaults to koauthUrl if not set)
  koauthJwksUrl?: string; // JWKS endpoint (defaults to koauthUrl/.well-known/jwks.json)

  // OAuth 2.0 Configuration (optional - required only for OAuth flow)
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthRedirectUri?: string;

  // Access Control
  allowedEmails?: string[]; // Email whitelist for signup control (empty = allow all)

  // Database
  databaseUrl: string;

  // Vector Store
  vectorStoreUrl: string;
  vectorDbKey?: string;

  // OpenAI
  openaiApiKey?: string;
  openaiOrganization?: string;
  openaiProject?: string;
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
 * Parse comma-separated email list
 */
function parseEmailList(value: string | undefined): string[] | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }

  return value
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
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
    apiBaseUrl: getOptionalEnv('API_BASE_URL'), // Explicit base URL for OAuth discovery

    // KOauth Authentication
    koauthUrl: getEnv('KOAUTH_URL', 'https://auth.tillmaessen.de'),
    koauthTimeout: getEnvInt('KOAUTH_TIMEOUT', 5000),
    koauthIssuer: getOptionalEnv('KOAUTH_ISSUER'), // Defaults to koauthUrl if not set
    koauthJwksUrl: getOptionalEnv('KOAUTH_JWKS_URL'), // Defaults to koauthUrl/.well-known/jwks.json

    // OAuth 2.0 Configuration (optional)
    oauthClientId: getOptionalEnv('OAUTH_CLIENT_ID'),
    oauthClientSecret: getOptionalEnv('OAUTH_CLIENT_SECRET'),
    oauthRedirectUri: getOptionalEnv('OAUTH_REDIRECT_URI'),

    // Access Control
    allowedEmails: parseEmailList(getOptionalEnv('ALLOWED_EMAILS')),

    // Database
    databaseUrl: normalizeDatabasePath(
      getEnv('DATABASE_URL', './data/metadata/knowledge.db')
    ),

    // Vector Store
    vectorStoreUrl: getEnv('VECTOR_STORE_URL', 'http://localhost:8000'),
    vectorDbKey: getOptionalEnv('VECTOR_DB_KEY'),

    // OpenAI
    openaiApiKey: getOptionalEnv('OPENAI_API_KEY'),
    openaiOrganization: getOptionalEnv('OPENAI_ORG_ID'),
    openaiProject: getOptionalEnv('OPENAI_PROJECT_ID'),
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

  // Validate configuration
  validateConfig(config);

  return config;
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate port number
 */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Validate log level
 */
function isValidLogLevel(level: string): boolean {
  return ['error', 'warn', 'info', 'debug'].includes(level);
}

/**
 * Validate configuration
 * Collects all validation errors and fails fast with clear messages
 */
function validateConfig(config: Config): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields (always required)
  if (!config.koauthUrl) {
    errors.push('KOAUTH_URL is required');
  } else if (!isValidUrl(config.koauthUrl)) {
    errors.push(`KOAUTH_URL must be a valid HTTP/HTTPS URL (got: ${config.koauthUrl})`);
  }

  if (!config.vectorStoreUrl) {
    errors.push('VECTOR_STORE_URL is required');
  } else if (!isValidUrl(config.vectorStoreUrl)) {
    errors.push(`VECTOR_STORE_URL must be a valid HTTP/HTTPS URL (got: ${config.vectorStoreUrl})`);
  }

  // Validate port
  if (!isValidPort(config.apiPort)) {
    errors.push(`API_PORT must be a valid port number 1-65535 (got: ${config.apiPort})`);
  }

  // Validate KOauth timeout
  if (config.koauthTimeout <= 0) {
    errors.push(`KOAUTH_TIMEOUT must be a positive integer (got: ${config.koauthTimeout})`);
  }

  // Validate log level
  if (!isValidLogLevel(config.logLevel)) {
    errors.push(`LOG_LEVEL must be one of: error, warn, info, debug (got: ${config.logLevel})`);
  }

  // Validate max file size
  if (config.maxFileSize <= 0) {
    errors.push(`MAX_FILE_SIZE must be a positive integer (got: ${config.maxFileSize})`);
  }

  // Validate TLS configuration (both or neither)
  if ((config.tlsCertPath && !config.tlsKeyPath) || (!config.tlsCertPath && config.tlsKeyPath)) {
    errors.push('TLS_CERT_PATH and TLS_KEY_PATH must both be set or both be empty');
  }

  // Production-specific validation
  if (config.nodeEnv === 'production') {
    // Note: API_KEY validation removed as it's deprecated in favor of KOauth

    // OpenAI API key should be set
    if (!config.openaiApiKey) {
      warnings.push(
        'OPENAI_API_KEY is not set. Vector embeddings will not work without it.'
      );
    }

    // CORS should be restricted
    if (config.corsOrigin === '*') {
      warnings.push(
        'CORS_ORIGIN is set to "*" (allow all). Consider restricting to specific domain(s) in production.'
      );
    }
  }

  // Development/test warnings
  if (config.nodeEnv !== 'production') {
    if (!config.openaiApiKey) {
      warnings.push(
        'OPENAI_API_KEY is not set. Search functionality will be limited to full-text search only.'
      );
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Configuration warnings:');
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
    console.warn('');
  }

  // Fail fast if there are errors
  if (errors.length > 0) {
    const errorMessage = `\n❌ Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\nPlease check your .env file and environment variables.\nSee .env.example for required configuration.\n`;
    throw new Error(errorMessage);
  }
}

/**
 * Print configuration (safe - hides sensitive values)
 */
export function printConfig(config: Config): void {
  const safeToPrint = {
    nodeEnv: config.nodeEnv,
    apiPort: config.apiPort,
    apiKey: maskSecret(config.apiKey) + ' (deprecated)',
    koauthUrl: config.koauthUrl,
    koauthTimeout: `${config.koauthTimeout}ms`,
    koauthIssuer: config.koauthIssuer || '<defaults to koauthUrl>',
    koauthJwksUrl: config.koauthJwksUrl || '<defaults to koauthUrl/.well-known/jwks.json>',
    oauthClientId: config.oauthClientId,
    oauthClientSecret: maskSecret(config.oauthClientSecret),
    oauthRedirectUri: config.oauthRedirectUri,
    allowedEmails: config.allowedEmails ? `${config.allowedEmails.length} email(s) whitelisted` : '<all emails allowed>',
    databaseUrl: config.databaseUrl,
    vectorStoreUrl: config.vectorStoreUrl,
    vectorDbKey: maskSecret(config.vectorDbKey),
    openaiApiKey: maskSecret(config.openaiApiKey),
    openaiOrganization: config.openaiOrganization || '<not set>',
    openaiProject: config.openaiProject || '<not set>',
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
