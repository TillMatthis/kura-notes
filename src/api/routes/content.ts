/**
 * KURA Notes - Content Retrieval Routes
 *
 * Endpoints for retrieving and viewing stored content
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { DatabaseService } from '../../services/database/database.service.js';
import { FileStorageService } from '../../services/fileStorage.js';
import { VectorStoreService } from '../../services/vectorStore.js';
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
  image_metadata?: any;
  pdf_metadata?: any;
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
  image_metadata?: any;
  pdf_metadata?: any;
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
  fileStorage: FileStorageService,
  vectorStore: VectorStoreService
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
          image_metadata: item.image_metadata,
          pdf_metadata: item.pdf_metadata,
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
          image_metadata: metadata.image_metadata,
          pdf_metadata: metadata.pdf_metadata,
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

  /**
   * GET /api/content/:id/file
   * Get raw file content (for images, PDFs, etc.)
   * Streams the file with appropriate content-type headers
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/content/:id/file',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<void> => {
      const { id } = request.params;

      logger.debug('File download request', { id });

      // Get metadata from database
      const metadata = db.getContentById(id);

      if (!metadata) {
        logger.warn('Content not found', { id });
        throw ApiErrors.notFound('Content not found');
      }

      try {
        // Create read stream for the file
        const streamResult = fileStorage.createReadStream(id);

        if (!streamResult.success || !streamResult.stream) {
          logger.error('Failed to create file stream', {
            id,
            error: streamResult.error,
          });
          throw ApiErrors.storageError('Failed to read file');
        }

        // Determine content type from file extension
        const filePath = metadata.file_path;
        let contentType = 'application/octet-stream';

        if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
          contentType = 'image/jpeg';
        } else if (filePath.endsWith('.png')) {
          contentType = 'image/png';
        } else if (filePath.endsWith('.gif')) {
          contentType = 'image/gif';
        } else if (filePath.endsWith('.webp')) {
          contentType = 'image/webp';
        } else if (filePath.endsWith('.pdf')) {
          contentType = 'application/pdf';
        }

        // Set headers
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        // Set Content-Disposition for PDFs to trigger download
        if (contentType === 'application/pdf') {
          const filename = metadata.title || `document-${id}.pdf`;
          reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        }

        logger.info('Streaming file', {
          id,
          contentType,
        });

        // Stream the file
        return reply.send(streamResult.stream);
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error streaming file', { error, id });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to stream file'
        );
      }
    }
  );

  /**
   * GET /api/content/:id/thumbnail
   * Get thumbnail for image content
   * If thumbnail doesn't exist, serves the full image
   * Returns 404 for non-image content
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/content/:id/thumbnail',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<void> => {
      const { id } = request.params;

      logger.debug('Thumbnail request', { id });

      // Get metadata from database
      const metadata = db.getContentById(id);

      if (!metadata) {
        logger.warn('Content not found', { id });
        throw ApiErrors.notFound('Content not found');
      }

      // Only serve thumbnails for images
      if (metadata.content_type !== 'image') {
        logger.warn('Thumbnail requested for non-image content', {
          id,
          contentType: metadata.content_type,
        });
        throw ApiErrors.notFound('Thumbnails only available for images');
      }

      try {
        // Determine which file to serve: thumbnail or full image
        let filePathToServe = metadata.file_path;
        let isThumbnail = false;

        if (metadata.thumbnail_path) {
          // Serve thumbnail if it exists
          filePathToServe = metadata.thumbnail_path;
          isThumbnail = true;
          logger.debug('Serving thumbnail', { id, thumbnailPath: filePathToServe });
        } else {
          // Fall back to full image
          logger.debug('No thumbnail available, serving full image', {
            id,
            filePath: filePathToServe,
          });
        }

        // Get the absolute path
        const fs = await import('fs');
        const path = await import('path');
        const config = await import('../../config/index.js');

        const absolutePath = path.join(config.config.storageBasePath, filePathToServe);

        // Check if file exists
        if (!fs.existsSync(absolutePath)) {
          logger.error('File not found on disk', { id, path: absolutePath });
          throw ApiErrors.storageError('File not found on disk');
        }

        // Determine content type
        let contentType = 'image/jpeg';
        if (filePathToServe.endsWith('.png')) {
          contentType = 'image/png';
        } else if (filePathToServe.endsWith('.gif')) {
          contentType = 'image/gif';
        } else if (filePathToServe.endsWith('.webp')) {
          contentType = 'image/webp';
        }

        // Set headers for caching (1 hour for thumbnails)
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        logger.info('Serving thumbnail/image', {
          id,
          isThumbnail,
          contentType,
          path: filePathToServe,
        });

        // Create read stream and send
        const stream = fs.createReadStream(absolutePath);
        return reply.send(stream);
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error serving thumbnail', { error, id });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to serve thumbnail'
        );
      }
    }
  );

  /**
   * GET /api/content/:id/download
   * Download file content (especially for PDFs)
   * Forces download with Content-Disposition: attachment
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/content/:id/download',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<void> => {
      const { id } = request.params;

      logger.debug('File download request', { id });

      // Get metadata from database
      const metadata = db.getContentById(id);

      if (!metadata) {
        logger.warn('Content not found', { id });
        throw ApiErrors.notFound('Content not found');
      }

      try {
        // Create read stream for the file
        const streamResult = fileStorage.createReadStream(id);

        if (!streamResult.success || !streamResult.stream) {
          logger.error('Failed to create file stream', {
            id,
            error: streamResult.error,
          });
          throw ApiErrors.storageError('Failed to read file');
        }

        // Determine content type and filename from metadata
        let contentType = 'application/octet-stream';
        let filename = 'download';

        const filePath = metadata.file_path;

        // Determine content type from file extension
        if (filePath.endsWith('.pdf')) {
          contentType = 'application/pdf';
          filename = metadata.pdf_metadata?.filename || metadata.title || `document-${id}.pdf`;
        } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
          contentType = 'image/jpeg';
          filename = metadata.title || `image-${id}.jpg`;
        } else if (filePath.endsWith('.png')) {
          contentType = 'image/png';
          filename = metadata.title || `image-${id}.png`;
        } else if (filePath.endsWith('.gif')) {
          contentType = 'image/gif';
          filename = metadata.title || `image-${id}.gif`;
        } else if (filePath.endsWith('.webp')) {
          contentType = 'image/webp';
          filename = metadata.title || `image-${id}.webp`;
        }

        // Set headers to force download
        reply.header('Content-Type', contentType);
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);

        // Add file size if available
        if (metadata.pdf_metadata?.size) {
          reply.header('Content-Length', metadata.pdf_metadata.size.toString());
        } else if (metadata.image_metadata?.size) {
          reply.header('Content-Length', metadata.image_metadata.size.toString());
        }

        logger.info('Streaming file for download', {
          id,
          contentType,
          filename,
        });

        // Stream the file
        return reply.send(streamResult.stream);
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error streaming file for download', { error, id });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to stream file'
        );
      }
    }
  );

  /**
   * DELETE /api/content/:id
   * Delete content and associated file
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/content/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      _reply: FastifyReply
    ): Promise<{ success: true; message: string; timestamp: string }> => {
      const { id } = request.params;

      logger.debug('Content deletion request', { id });

      // Check if content exists
      const metadata = db.getContentById(id);
      if (!metadata) {
        logger.warn('Content not found for deletion', { id });
        throw ApiErrors.notFound('Content not found');
      }

      try {
        // Delete file and metadata using FileStorageService
        const result = await fileStorage.deleteFile(id);

        if (!result.success) {
          logger.error('Failed to delete content', {
            id,
            error: result.error,
          });
          throw ApiErrors.storageError(result.error || 'Failed to delete content');
        }

        // Also delete from ChromaDB if embedding exists
        // Don't fail the delete if ChromaDB deletion fails
        try {
          await vectorStore.deleteDocument(id);
          logger.debug('Embedding deleted from ChromaDB', { id });
        } catch (vectorError) {
          logger.warn('Failed to delete embedding from ChromaDB (non-critical)', {
            id,
            error: vectorError instanceof Error ? vectorError.message : 'Unknown error',
          });
          // Continue - we don't want to fail the whole delete operation
        }

        logger.info('Content deleted successfully', {
          id,
          contentType: metadata.content_type,
        });

        return {
          success: true,
          message: 'Content deleted successfully',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error deleting content', { error, id });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to delete content'
        );
      }
    }
  );

  /**
   * PATCH /api/content/:id
   * Update content metadata (title, annotation, tags)
   */
  fastify.patch<{
    Params: { id: string };
    Body: { title?: string; annotation?: string; tags?: string[] };
  }>(
    '/api/content/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { title?: string; annotation?: string; tags?: string[] };
      }>,
      _reply: FastifyReply
    ): Promise<{ success: true; content: ContentMetadata; message: string; timestamp: string }> => {
      const { id } = request.params;
      const { title, annotation, tags } = request.body;

      logger.debug('Content metadata update request', { id, title, annotation, tags });

      // Check if content exists
      const existingContent = db.getContentById(id);
      if (!existingContent) {
        logger.warn('Content not found for update', { id });
        throw ApiErrors.notFound('Content not found');
      }

      // Validate inputs
      if (title !== undefined) {
        if (typeof title !== 'string') {
          throw ApiErrors.validationError('Title must be a string');
        }
        if (title.length > 200) {
          throw ApiErrors.validationError('Title cannot exceed 200 characters');
        }
      }

      if (annotation !== undefined) {
        if (typeof annotation !== 'string') {
          throw ApiErrors.validationError('Annotation must be a string');
        }
        if (annotation.length > 5000) {
          throw ApiErrors.validationError('Annotation cannot exceed 5000 characters');
        }
      }

      if (tags !== undefined) {
        if (!Array.isArray(tags)) {
          throw ApiErrors.validationError('Tags must be an array');
        }
        if (tags.length > 20) {
          throw ApiErrors.validationError('Cannot exceed 20 tags');
        }

        // Validate tag format
        const tagPattern = /^[a-zA-Z0-9-_]+$/;
        for (const tag of tags) {
          if (typeof tag !== 'string') {
            throw ApiErrors.validationError('Each tag must be a string');
          }
          if (tag.length > 50) {
            throw ApiErrors.validationError('Each tag cannot exceed 50 characters');
          }
          if (!tagPattern.test(tag)) {
            throw ApiErrors.validationError(
              `Invalid tag format: "${tag}". Tags can only contain letters, numbers, dashes, and underscores.`
            );
          }
        }
      }

      try {
        // Update content metadata in database
        const updatedContent = db.updateContent(id, {
          title,
          annotation,
          tags,
        });

        if (!updatedContent) {
          logger.error('Failed to update content metadata', { id });
          throw ApiErrors.storageError('Failed to update content metadata');
        }

        logger.info('Content metadata updated successfully', {
          id,
          updatedFields: {
            title: title !== undefined,
            annotation: annotation !== undefined,
            tags: tags !== undefined,
          },
        });

        // Return updated metadata (exclude file_path and extracted_text)
        const metadata: ContentMetadata = {
          id: updatedContent.id,
          content_type: updatedContent.content_type,
          title: updatedContent.title,
          annotation: updatedContent.annotation,
          tags: updatedContent.tags,
          source: updatedContent.source,
          image_metadata: updatedContent.image_metadata,
          pdf_metadata: updatedContent.pdf_metadata,
          created_at: updatedContent.created_at,
          updated_at: updatedContent.updated_at,
        };

        return {
          success: true,
          content: metadata,
          message: 'Content metadata updated successfully',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error updating content metadata', { error, id });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to update content metadata'
        );
      }
    }
  );

  /**
   * POST /api/content/bulk/delete
   * Delete multiple content items at once
   */
  fastify.post(
    '/api/content/bulk/delete',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 100, // Limit to 100 items per bulk operation
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { ids } = request.body as { ids: string[] };

      try {
        logger.info('Bulk delete request received', {
          count: ids.length,
          ...(process.env.NODE_ENV !== 'production' && { ids: ids.slice(0, 10) }),
        });

        const results = {
          successful: [] as string[],
          failed: [] as { id: string; error: string }[],
        };

        // Process each deletion
        for (const id of ids) {
          try {
            // Get content metadata to find file path
            const content = await db.getContentById(id);
            if (!content) {
              results.failed.push({ id, error: 'Content not found' });
              continue;
            }

            // Delete from filesystem
            try {
              await fileStorage.deleteFile(content.file_path);
            } catch (error) {
              logger.warn('Failed to delete file from filesystem', {
                id,
                file_path: content.file_path,
                error,
              });
              // Continue with deletion even if file doesn't exist
            }

            // Delete thumbnail if it exists
            if (content.thumbnail_path) {
              try {
                await fileStorage.deleteFile(content.thumbnail_path);
              } catch (error) {
                logger.warn('Failed to delete thumbnail', {
                  id,
                  thumbnail_path: content.thumbnail_path,
                  error,
                });
              }
            }

            // Delete from vector store
            try {
              await vectorStore.deleteDocument(id);
            } catch (error) {
              logger.warn('Failed to delete from vector store', { id, error });
              // Continue with deletion even if vector store fails
            }

            // Delete from database
            await db.deleteContent(id);

            results.successful.push(id);
            logger.info('Content deleted successfully in bulk operation', { id });
          } catch (error) {
            logger.error('Failed to delete content in bulk operation', {
              id,
              error,
            });
            results.failed.push({
              id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        const statusCode =
          results.failed.length === 0
            ? 200
            : results.successful.length === 0
            ? 500
            : 207; // Multi-Status for partial success

        logger.info('Bulk delete completed', {
          total: ids.length,
          successful: results.successful.length,
          failed: results.failed.length,
        });

        return reply.code(statusCode).send({
          success: results.failed.length === 0,
          results,
          message: `Deleted ${results.successful.length} of ${ids.length} items`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Unexpected error in bulk delete', { error });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to delete content'
        );
      }
    }
  );

  /**
   * POST /api/content/bulk/tag
   * Add tags to multiple content items at once
   */
  fastify.post(
    '/api/content/bulk/tag',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ids', 'tags'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 100, // Limit to 100 items per bulk operation
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 20, // Match individual tag limit
            },
            mode: {
              type: 'string',
              enum: ['add', 'replace'],
              default: 'add',
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { ids, tags, mode = 'add' } = request.body as {
        ids: string[];
        tags: string[];
        mode?: 'add' | 'replace';
      };

      try {
        // Validate tags format
        const tagRegex = /^[a-zA-Z0-9_-]+$/;
        for (const tag of tags) {
          if (!tagRegex.test(tag) || tag.length > 50) {
            throw ApiErrors.validationError(
              `Invalid tag format: "${tag}". Tags must be alphanumeric with dashes/underscores, max 50 characters.`
            );
          }
        }

        logger.info('Bulk tag request received', {
          count: ids.length,
          tags,
          mode,
          ...(process.env.NODE_ENV !== 'production' && { ids: ids.slice(0, 10) }),
        });

        const results = {
          successful: [] as string[],
          failed: [] as { id: string; error: string }[],
        };

        // Process each item
        for (const id of ids) {
          try {
            // Get current content
            const content = await db.getContentById(id);
            if (!content) {
              results.failed.push({ id, error: 'Content not found' });
              continue;
            }

            // Calculate new tags
            let newTags: string[];
            if (mode === 'replace') {
              newTags = tags;
            } else {
              // Add mode: merge with existing tags, remove duplicates
              const existingTags = content.tags || [];
              newTags = Array.from(new Set([...existingTags, ...tags]));
            }

            // Enforce max tags limit
            if (newTags.length > 20) {
              results.failed.push({
                id,
                error: `Too many tags (${newTags.length}). Maximum is 20.`,
              });
              continue;
            }

            // Update tags in database
            await db.updateContentTags(id, newTags);

            results.successful.push(id);
            logger.info('Tags updated successfully in bulk operation', {
              id,
              tagsAdded: tags,
              mode,
            });
          } catch (error) {
            logger.error('Failed to update tags in bulk operation', {
              id,
              error,
            });
            results.failed.push({
              id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        const statusCode =
          results.failed.length === 0
            ? 200
            : results.successful.length === 0
            ? 500
            : 207; // Multi-Status for partial success

        logger.info('Bulk tag operation completed', {
          total: ids.length,
          successful: results.successful.length,
          failed: results.failed.length,
        });

        return reply.code(statusCode).send({
          success: results.failed.length === 0,
          results,
          message: `Updated tags for ${results.successful.length} of ${ids.length} items`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        logger.error('Unexpected error in bulk tag operation', { error });
        throw ApiErrors.storageError(
          error instanceof Error ? error.message : 'Failed to update tags'
        );
      }
    }
  );

  logger.info('Content retrieval routes registered');
}
