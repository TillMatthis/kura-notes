/**
 * KURA Notes - Logging Service
 *
 * Centralized logging using Winston with:
 * - Console transport for development
 * - File transport with daily rotation for production
 * - Structured JSON logging in production
 * - Human-readable format in development
 * - Automatic sensitive data filtering
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config/index.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Sensitive keys that should never be logged
 */
const SENSITIVE_KEYS = [
  'password',
  'apiKey',
  'api_key',
  'apikey',
  'token',
  'secret',
  'authorization',
  'auth',
  'openaiApiKey',
  'openai_api_key',
  'vectorDbKey',
  'vector_db_key',
];

/**
 * Recursively filter sensitive data from objects
 */
function filterSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if it looks like a sensitive value (long alphanumeric strings)
    if (obj.length > 20 && /^[A-Za-z0-9_\-+=\/]+$/.test(obj)) {
      return maskValue(obj);
    }
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => filterSensitiveData(item));
  }

  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if the key is sensitive
    if (SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
      filtered[key] = maskValue(String(value));
    } else {
      filtered[key] = filterSensitiveData(value);
    }
  }

  return filtered;
}

/**
 * Mask sensitive values
 */
function maskValue(value: string): string {
  if (!value || value.length === 0) {
    return '<empty>';
  }

  if (value.length <= 8) {
    return '***';
  }

  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

/**
 * Ensure log directory exists
 */
function ensureLogDirectory(logPath: string): void {
  const dir = dirname(logPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Custom format for development (human-readable)
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(filterSensitiveData(meta), null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

/**
 * Custom format for production (JSON with sensitive data filtering)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const filtered = filterSensitiveData(info);
    return JSON.stringify(filtered);
  })
);

/**
 * Create Winston logger instance
 */
function createLogger(): winston.Logger {
  const isDevelopment = config.nodeEnv === 'development' || config.nodeEnv === 'test';
  const transports: winston.transport[] = [];

  // Console transport (always enabled in development, optional in production)
  if (isDevelopment || process.env.LOG_TO_CONSOLE === 'true') {
    transports.push(
      new winston.transports.Console({
        level: config.logLevel,
        format: isDevelopment ? developmentFormat : productionFormat,
      })
    );
  }

  // File transports (production and optional in development)
  if (!isDevelopment || process.env.LOG_TO_FILE === 'true') {
    const logPath = `${config.logDir}/application-%DATE%.log`;
    const errorLogPath = `${config.logDir}/error-%DATE%.log`;

    // Ensure log directory exists
    ensureLogDirectory(logPath);

    // Daily rotating file for all logs
    transports.push(
      new DailyRotateFile({
        filename: logPath,
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '7d', // Keep logs for 7 days
        level: config.logLevel,
        format: productionFormat,
      })
    );

    // Separate daily rotating file for errors only
    transports.push(
      new DailyRotateFile({
        filename: errorLogPath,
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d', // Keep error logs for 30 days
        level: 'error',
        format: productionFormat,
      })
    );
  }

  return winston.createLogger({
    level: config.logLevel,
    transports,
    // Don't exit on uncaught exceptions (let the process manager handle it)
    exitOnError: false,
  });
}

/**
 * Singleton logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with additional metadata
 */
export function createChildLogger(meta: Record<string, unknown>): winston.Logger {
  return logger.child(filterSensitiveData(meta) as Record<string, unknown>);
}

/**
 * Log application startup
 */
export function logStartup(appName: string, version: string): void {
  logger.info('='.repeat(80));
  logger.info(`🚀 ${appName} v${version} - Starting...`);
  logger.info('='.repeat(80));
  logger.info('Environment', {
    nodeEnv: config.nodeEnv,
    nodeVersion: process.version,
    platform: process.platform,
    logLevel: config.logLevel,
  });
}

/**
 * Log application shutdown
 */
export function logShutdown(appName: string, reason?: string): void {
  logger.info('='.repeat(80));
  logger.info(`👋 ${appName} - Shutting down...`, { reason });
  logger.info('='.repeat(80));
}

/**
 * Log service initialization
 */
export function logServiceInit(serviceName: string, details?: Record<string, unknown>): void {
  logger.info(`📦 Initializing ${serviceName}...`, details);
}

/**
 * Log service ready
 */
export function logServiceReady(serviceName: string, details?: Record<string, unknown>): void {
  logger.info(`✅ ${serviceName} ready`, details);
}

/**
 * Log service error
 */
export function logServiceError(serviceName: string, error: Error, context?: Record<string, unknown>): void {
  logger.error(`❌ ${serviceName} error`, {
    error: error.message,
    stack: error.stack,
    ...context,
  });
}

/**
 * Export logger as default
 */
export default logger;
