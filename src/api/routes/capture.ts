/**
 * KURA Notes - Content Capture Routes
 *
 * Endpoints for capturing and storing content (text, images, PDFs)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { FileStorageService } from '../../services/fileStorage.js';
import { ApiErrors } from '../types/errors.js';

/**
 * Request body schema for text content capture
 */
interface CaptureTextRequest {
  content: string;
  title?: string;
  annotation?: string;
  tags?: string[];
  contentType?: 'text'; // Default to text for this endpoint
}

/**
 * Response schema for successful capture
 */
interface CaptureResponse {
  success: true;
  id: string;
  message: string;
  timestamp: string;
}

/**
 * Fastify JSON schema for text capture request validation
 */
const captureTextSchema = {
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: {
        type: 'string',
        minLength: 1,
        maxLength: 1000000, // 1MB of text
        description: 'The text content to capture',
      },
      title: {
        type: 'string',
        maxLength: 500,
        description: 'Optional title for the content',
      },
      annotation: {
        type: 'string',
        maxLength: 5000,
        description: 'Optional annotation or context',
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 50,
          pattern: '^[a-zA-Z0-9-_]+$', // Tags can only contain alphanumeric, dash, underscore
        },
        maxItems: 20,
        description: 'Optional tags for categorization',
      },
      contentType: {
        type: 'string',
        enum: ['text'],
        default: 'text',
        description: 'Content type (always text for this endpoint)',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      required: ['success', 'id', 'message', 'timestamp'],
      properties: {
        success: { type: 'boolean', enum: [true] },
        id: { type: 'string', format: 'uuid' },
        message: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
    400: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
    500: {
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
 * Register content capture routes
 */
export async function registerCaptureRoutes(
  fastify: FastifyInstance,
  fileStorage: FileStorageService
): Promise<void> {
  /**
   * POST /api/capture
   * Capture text content and store it
   */
  fastify.post<{ Body: CaptureTextRequest }>(
    '/api/capture',
    {
      schema: captureTextSchema,
    },
    async (
      request: FastifyRequest<{ Body: CaptureTextRequest }>,
      _reply: FastifyReply
    ): Promise<CaptureResponse> => {
      const { content, title, annotation, tags } = request.body;

      logger.info('Capture request received', {
        contentType: 'text',
        hasTitle: !!title,
        hasAnnotation: !!annotation,
        tagCount: tags?.length || 0,
        contentLength: content.length,
      });

      // Validate content is not empty (after trimming)
      if (!content || content.trim().length === 0) {
        logger.warn('Empty content in capture request');
        throw ApiErrors.validationError('Content cannot be empty');
      }

      // Validate tags format if provided
      if (tags && tags.length > 0) {
        const tagPattern = /^[a-zA-Z0-9-_]+$/;
        const invalidTags = tags.filter((tag) => !tagPattern.test(tag));
        if (invalidTags.length > 0) {
          logger.warn('Invalid tag format', { invalidTags });
          throw ApiErrors.validationError(
            `Invalid tag format: ${invalidTags.join(', ')}. Tags can only contain letters, numbers, dashes, and underscores.`
          );
        }
      }

      try {
        // Save file using file storage service
        const result = await fileStorage.saveFile({
          content,
          contentType: 'text',
          title,
          annotation,
          tags,
          mimeType: 'text/plain',
        });

        if (!result.success) {
          logger.error('Failed to save content', { error: result.error });
          throw ApiErrors.storageError(result.error || 'Failed to save content');
        }

        logger.info('Content captured successfully', {
          id: result.id,
          filePath: result.filePath,
        });

        return {
          success: true,
          id: result.id!,
          message: 'Content captured successfully',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        // Otherwise, wrap it as a storage error
        logger.error('Unexpected error in capture endpoint', { error });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Unknown error occurred'
        );
      }
    }
  );

  logger.info('Capture routes registered');
}
