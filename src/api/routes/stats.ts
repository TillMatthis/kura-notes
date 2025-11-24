/**
 * KURA Notes - Stats API Endpoint
 *
 * Provides system statistics for the dashboard
 * Includes content counts, storage usage, and most used tags
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getStatsService } from '../../services/statsService.js';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';
import { getAuthenticatedUser } from '../middleware/auth.js';

/**
 * Stats handler
 * Returns cached statistics (refreshed every 5 minutes) scoped to authenticated user
 */
async function statsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  logger.debug('Stats endpoint requested');

  try {
    // Get authenticated user
    const user = getAuthenticatedUser(request);

    const statsService = getStatsService();
    const stats = statsService.getStats(user.id);

    logger.debug('Stats retrieved successfully', {
      userId: user.id,
      totalItems: stats.totalItems,
      lastUpdated: stats.lastUpdated,
    });

    return reply.status(200).send({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to retrieve stats', { error });

    // Re-throw ApiErrors (including authentication errors)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    // Let the centralized error handler deal with it
    throw ApiErrors.internalError(
      error instanceof Error ? error.message : 'Failed to retrieve statistics'
    );
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
