/**
 * KURA Notes - Tags API Routes
 *
 * Endpoints for tag management:
 * - GET /api/tags - Get all tags with usage counts
 * - GET /api/tags/search - Search tags for autocomplete
 * - PATCH /api/tags/:tagName/rename - Rename a tag
 * - POST /api/tags/merge - Merge tags
 * - DELETE /api/tags/:tagName - Delete a tag
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TagService } from '../../services/tagService.js';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';
import { getOptionalUser } from '../middleware/auth.js';

/**
 * Register tag routes
 */
export async function registerTagRoutes(
  server: FastifyInstance,
  tagService: TagService
): Promise<void> {
  /**
   * GET /api/tags
   * Get all tags with usage counts
   */
  server.get(
    '/api/tags',
    {
      schema: {
        description: 'Get all tags with usage counts',
        tags: ['tags'],
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of tags to return',
              default: 100,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              tags: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tag: { type: 'string' },
                    count: { type: 'number' },
                  },
                },
              },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        logger.debug('GET /api/tags request received', {
          limit: request.query.limit,
        });

        const limit = request.query.limit || 100;

        // Get all tags
        const allTags = tagService.getAllTags();
        const limitedTags = allTags.slice(0, limit);

        reply.code(200).send({
          tags: limitedTags,
          total: allTags.length,
        });
      } catch (error) {
        logger.error('Failed to get tags', { error });
        throw ApiErrors.internalError(
          error instanceof Error ? error.message : 'Failed to get tags'
        );
      }
    }
  );

  /**
   * GET /api/tags/search
   * Search tags for autocomplete
   */
  server.get(
    '/api/tags/search',
    {
      schema: {
        description: 'Search tags for autocomplete',
        tags: ['tags'],
        querystring: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query (case-insensitive)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 20,
            },
          },
          required: ['q'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              tags: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tag: { type: 'string' },
                    count: { type: 'number' },
                  },
                },
              },
              query: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { q: string; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const query = request.query.q;
        const limit = request.query.limit || 20;

        // Get optional user (works for both authenticated and public access)
        const user = getOptionalUser(request);

        logger.debug('GET /api/tags/search request received', {
          userId: user?.id,
          query,
          limit,
        });

        if (!query || query.trim().length === 0) {
          logger.warn('Missing search query parameter');
          throw ApiErrors.validationError('Search query parameter (q) is required');
        }

        // Search tags (scoped to user if authenticated)
        const tags = tagService.searchTags(query, user?.id || null, limit);

        reply.code(200).send({
          tags,
          query,
        });
      } catch (error) {
        logger.error('Failed to search tags', { error });

        // Re-throw ApiErrors
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        throw ApiErrors.internalError(
          error instanceof Error ? error.message : 'Failed to search tags'
        );
      }
    }
  );

  /**
   * PATCH /api/tags/:tagName/rename
   * Rename a tag across all content
   */
  server.patch(
    '/api/tags/:tagName/rename',
    {
      schema: {
        description: 'Rename a tag across all content',
        tags: ['tags'],
        params: {
          type: 'object',
          properties: {
            tagName: { type: 'string' },
          },
          required: ['tagName'],
        },
        body: {
          type: 'object',
          properties: {
            newTag: { type: 'string' },
          },
          required: ['newTag'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              oldTag: { type: 'string' },
              newTag: { type: 'string' },
              updatedCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { tagName: string };
        Body: { newTag: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const oldTag = decodeURIComponent(request.params.tagName);
        const { newTag } = request.body;

        logger.info('PATCH /api/tags/:tagName/rename request received', {
          oldTag,
          newTag,
        });

        if (!newTag || newTag.trim().length === 0) {
          logger.warn('Missing new tag name');
          throw ApiErrors.validationError('New tag name is required');
        }

        // Rename tag
        const updatedCount = tagService.renameTag(oldTag, newTag);

        reply.code(200).send({
          success: true,
          oldTag,
          newTag,
          updatedCount,
        });
      } catch (error) {
        logger.error('Failed to rename tag', { error });

        // Re-throw ApiErrors
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        throw ApiErrors.internalError(
          error instanceof Error ? error.message : 'Failed to rename tag'
        );
      }
    }
  );

  /**
   * POST /api/tags/merge
   * Merge multiple tags into one
   */
  server.post(
    '/api/tags/merge',
    {
      schema: {
        description: 'Merge multiple tags into one',
        tags: ['tags'],
        body: {
          type: 'object',
          properties: {
            sourceTags: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
            targetTag: { type: 'string' },
          },
          required: ['sourceTags', 'targetTag'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              sourceTags: {
                type: 'array',
                items: { type: 'string' },
              },
              targetTag: { type: 'string' },
              updatedCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sourceTags: string[]; targetTag: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceTags, targetTag } = request.body;

        logger.info('POST /api/tags/merge request received', {
          sourceTags,
          targetTag,
        });

        if (!sourceTags || sourceTags.length === 0) {
          logger.warn('Missing source tags');
          throw ApiErrors.validationError('At least one source tag is required');
        }

        if (!targetTag || targetTag.trim().length === 0) {
          logger.warn('Missing target tag');
          throw ApiErrors.validationError('Target tag name is required');
        }

        // Merge tags
        const updatedCount = tagService.mergeTags(sourceTags, targetTag);

        reply.code(200).send({
          success: true,
          sourceTags,
          targetTag,
          updatedCount,
        });
      } catch (error) {
        logger.error('Failed to merge tags', { error });

        // Re-throw ApiErrors
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        throw ApiErrors.internalError(
          error instanceof Error ? error.message : 'Failed to merge tags'
        );
      }
    }
  );

  /**
   * DELETE /api/tags/:tagName
   * Delete a tag from all content
   */
  server.delete(
    '/api/tags/:tagName',
    {
      schema: {
        description: 'Delete a tag from all content',
        tags: ['tags'],
        params: {
          type: 'object',
          properties: {
            tagName: { type: 'string' },
          },
          required: ['tagName'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              tag: { type: 'string' },
              deletedCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { tagName: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const tag = decodeURIComponent(request.params.tagName);

        logger.info('DELETE /api/tags/:tagName request received', { tag });

        // Delete tag
        const deletedCount = tagService.deleteTag(tag);

        reply.code(200).send({
          success: true,
          tag,
          deletedCount,
        });
      } catch (error) {
        logger.error('Failed to delete tag', { error });
        throw ApiErrors.internalError(
          error instanceof Error ? error.message : 'Failed to delete tag'
        );
      }
    }
  );

  logger.info('Tag routes registered');
}
