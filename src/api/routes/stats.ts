/**
 * KURA Notes - Stats API Endpoint
 *
 * Provides system statistics for the dashboard
 * Includes content counts, storage usage, and most used tags
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getStatsService } from '../../services/statsService.js';
import { logger } from '../../utils/logger.js';

/**
 * Stats handler
 * Returns cached statistics (refreshed every 5 minutes)
 */
async function statsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  logger.debug('Stats endpoint requested');

  try {
    const statsService = getStatsService();
    const stats = statsService.getStats();

    logger.debug('Stats retrieved successfully', {
      totalItems: stats.totalItems,
      lastUpdated: stats.lastUpdated,
    });

    return reply.status(200).send({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to retrieve stats', { error });

    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Register stats routes
 */
export async function registerStatsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/stats - Get system statistics
  fastify.get('/api/stats', {
    schema: {
      description: 'Get system statistics',
      tags: ['stats'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                totalItems: { type: 'number' },
                byContentType: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                },
                byMonth: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      month: { type: 'string' },
                      count: { type: 'number' },
                    },
                  },
                },
                storageUsed: {
                  type: 'object',
                  properties: {
                    bytes: { type: 'number' },
                    formatted: { type: 'string' },
                  },
                },
                mostUsedTags: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      tag: { type: 'string' },
                      count: { type: 'number' },
                    },
                  },
                },
                lastUpdated: { type: 'string' },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: statsHandler,
  });

  logger.info('Stats routes registered');
}
