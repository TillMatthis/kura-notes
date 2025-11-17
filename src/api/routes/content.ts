/**
 * KURA Notes - Content Retrieval Routes
 *
 * Endpoints for retrieving and viewing stored content
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { DatabaseService } from '../../services/database/database.service.js';
import { FileStorageService } from '../../services/fileStorage.js';
import { ApiErrors } from '../types/errors.js';
import type { ContentType } from '../../models/content.js';

/**
 * Content metadata for recent items list
 * (excludes file_path and extracted_text for cleaner API response)
 */
interface ContentMetadata {
  id: string;
  content_type: ContentType;
  title: string | null;
  annotation: string | null;
  tags: string[];
  source: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Full content response including file content
 */
interface ContentResponse {
  id: string;
  content_type: ContentType;
  title: string | null;
  annotation: string | null;
  tags: string[];
  source: string | null;
  created_at: string;
  updated_at: string;
  content: string; // Actual file content
}

/**
 * Response schema for recent content list
 */
interface RecentContentResponse {
  success: true;
  items: ContentMetadata[];
  count: number;
  timestamp: string;
}

/**
 * Schema for GET /api/content/recent
 */
const recentContentSchema = {
  response: {
    200: {
      type: 'object',
      required: ['success', 'items', 'count', 'timestamp'],
      properties: {
        success: { type: 'boolean', enum: [true] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content_type: { type: 'string', enum: ['text', 'image', 'pdf', 'audio'] },
              title: { type: ['string', 'null'] },
              annotation: { type: ['string', 'null'] },
              tags: { type: 'array', items: { type: 'string' } },
              source: { type: ['string', 'null'] },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
        count: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};

/**
 * Schema for GET /api/content/:id
 */
const contentByIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: {
      type: 'object',
      required: [
        'id',
        'content_type',
        'title',
        'annotation',
        'tags',
        'source',
        'created_at',
        'updated_at',
        'content',
      ],
      properties: {
        id: { type: 'string' },
        content_type: { type: 'string', enum: ['text', 'image', 'pdf', 'audio'] },
        title: { type: ['string', 'null'] },
        annotation: { type: ['string', 'null'] },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
        content: { type: 'string' },
      },
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  },
};

/**
 * Register content retrieval routes
 */
export async function registerContentRoutes(
  fastify: FastifyInstance,
  db: DatabaseService,
  fileStorage: FileStorageService
): Promise<void> {
  /**
   * GET /api/content/recent
   * Get recent content items (last 20, metadata only)
   */
  fastify.get(
    '/api/content/recent',
    {
      schema: recentContentSchema,
    },
    async (_request: FastifyRequest, _reply: FastifyReply): Promise<RecentContentResponse> => {
      logger.debug('Recent content request received');

      try {
        const items = db.getRecentContent(20);

        // Map to metadata-only format (exclude file_path and extracted_text)
        const metadata: ContentMetadata[] = items.map((item) => ({
          id: item.id,
          content_type: item.content_type,
          title: item.title,
          annotation: item.annotation,
          tags: item.tags,
          source: item.source,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));

        logger.info('Recent content retrieved successfully', {
          count: metadata.length,
        });

        return {
          success: true,
          items: metadata,
          count: metadata.length,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error('Failed to retrieve recent content', { error });
        throw ApiErrors.storageError('Failed to retrieve recent content');
      }
    }
  );

  /**
   * GET /api/content/:id
   * Get full content by ID (including file content)
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/content/:id',
    {
      schema: contentByIdSchema,
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      _reply: FastifyReply
    ): Promise<ContentResponse> => {
      const { id } = request.params;

      logger.debug('Content retrieval request', { id });

      // Get metadata from database
      const metadata = db.getContentById(id);

      if (!metadata) {
        logger.warn('Content not found', { id });
        throw ApiErrors.notFound('Content not found');
      }

      // Read file content
      try {
        const fileContent = await fileStorage.readFile(id);

        if (!fileContent.success) {
          logger.error('Failed to read file content', {
            id,
            filePath: metadata.file_path,
            error: fileContent.error,
          });
          throw ApiErrors.storageError('Failed to read file content');
        }

        logger.info('Content retrieved successfully', {
          id,
          contentType: metadata.content_type,
        });

        // Convert Buffer to string for text content
        const content = fileContent.content!.toString('utf-8');

        return {
          id: metadata.id,
          content_type: metadata.content_type,
          title: metadata.title,
          annotation: metadata.annotation,
          tags: metadata.tags,
          source: metadata.source,
          created_at: metadata.created_at,
          updated_at: metadata.updated_at,
          content,
        };
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error retrieving content', { error, id });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to retrieve content'
        );
      }
    }
  );

  logger.info('Content retrieval routes registered');
}
