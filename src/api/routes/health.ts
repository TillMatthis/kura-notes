/**
 * KURA Notes - Health Check Endpoint
 *
 * Provides system health status including database and vector store
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabaseService } from '../../services/database/index.js';
import { getVectorStoreService } from '../../services/vectorStore.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Health check response interface
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceStatus;
    vectorStore: ServiceStatus;
  };
  version?: string;
}

/**
 * Service status interface
 */
export interface ServiceStatus {
  status: 'up' | 'down' | 'unknown';
  message?: string;
  responseTime?: number;
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<ServiceStatus> {
  const startTime = Date.now();

  try {
    const db = getDatabaseService();
    const isHealthy = db.healthCheck();
    const responseTime = Date.now() - startTime;

    if (isHealthy) {
      return {
        status: 'up',
        responseTime,
      };
    } else {
      return {
        status: 'down',
        message: 'Health check returned false',
        responseTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    };
  }
}

/**
 * Check vector store health
 */
async function checkVectorStoreHealth(): Promise<ServiceStatus> {
  const startTime = Date.now();

  try {
    // Check if the URL is configured
    if (!config.vectorStoreUrl) {
      return {
        status: 'unknown',
        message: 'Vector store URL not configured',
        responseTime: Date.now() - startTime,
      };
    }

    // Get vector store service and check health
    const vectorStore = getVectorStoreService();
    const isHealthy = await vectorStore.healthCheck();
    const responseTime = Date.now() - startTime;

    if (isHealthy) {
      const stats = await vectorStore.getStats();
      return {
        status: 'up',
        message: `Connected (${stats.count} documents)`,
        responseTime,
      };
    } else {
      return {
        status: 'down',
        message: 'ChromaDB connection failed',
        responseTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    };
  }
}

/**
 * Determine overall health status based on service statuses
 */
function determineOverallStatus(
  databaseStatus: ServiceStatus,
  vectorStoreStatus: ServiceStatus
): 'healthy' | 'degraded' | 'unhealthy' {
  // If database is down, system is unhealthy
  if (databaseStatus.status === 'down') {
    return 'unhealthy';
  }

  // If vector store is down (and it's configured), system is degraded
  if (vectorStoreStatus.status === 'down') {
    return 'degraded';
  }

  // If database is up, system is at least healthy
  // (vector store is optional for basic operations)
  if (databaseStatus.status === 'up') {
    return 'healthy';
  }

  // Default to degraded if we can't determine
  return 'degraded';
}

/**
 * Health check handler
 */
async function healthCheckHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<HealthCheckResponse> {
  logger.debug('Health check requested');

  // Check all services
  const [databaseStatus, vectorStoreStatus] = await Promise.all([
    checkDatabaseHealth(),
    checkVectorStoreHealth(),
  ]);

  // Determine overall status
  const status = determineOverallStatus(databaseStatus, vectorStoreStatus);

  // Build response
  const response: HealthCheckResponse = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: databaseStatus,
      vectorStore: vectorStoreStatus,
    },
  };

  // Add version if available
  if (process.env.npm_package_version) {
    response.version = process.env.npm_package_version;
  }

  // Set appropriate status code
  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

  logger.debug('Health check completed', {
    status,
    statusCode,
  });

  return reply.status(statusCode).send(response);
}

/**
 * Register health check routes
 */
export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check endpoint (no auth required)
  fastify.get('/api/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    message: { type: 'string' },
                    responseTime: { type: 'number' },
                  },
                },
                vectorStore: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    message: { type: 'string' },
                    responseTime: { type: 'number' },
                  },
                },
              },
            },
            version: { type: 'string' },
          },
        },
      },
    },
    handler: healthCheckHandler,
  });

  // Alternative health endpoint (common pattern)
  fastify.get('/health', healthCheckHandler);

  logger.info('Health check routes registered');
}
