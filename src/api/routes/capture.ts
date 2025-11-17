/**
 * KURA Notes - Content Capture Routes
 *
 * Endpoints for capturing and storing content (text, images, PDFs)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { logger } from '../../utils/logger.js';
import { FileStorageService } from '../../services/fileStorage.js';
import { EmbeddingPipelineService } from '../../services/embeddingPipeline.js';
import { ApiErrors } from '../types/errors.js';
import { getContentTypeFromMime } from '../../utils/fileValidation.js';
import type { ContentType } from '../../models/content.js';

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
 * Metadata from multipart form upload
 */
interface FileUploadMetadata {
  contentType?: ContentType;
  title?: string;
  annotation?: string;
  tags?: string[];
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

// Note: Schema validation removed to support both JSON and multipart/form-data
// Validation is now handled within the route handlers

/**
 * Validate tags format
 */
function validateTags(tags: string[]): void {
  const tagPattern = /^[a-zA-Z0-9-_]+$/;
  const invalidTags = tags.filter((tag) => !tagPattern.test(tag));
  if (invalidTags.length > 0) {
    logger.warn('Invalid tag format', { invalidTags });
    throw ApiErrors.validationError(
      `Invalid tag format: ${invalidTags.join(', ')}. Tags can only contain letters, numbers, dashes, and underscores.`
    );
  }
}

/**
 * Register content capture routes
 */
export async function registerCaptureRoutes(
  fastify: FastifyInstance,
  fileStorage: FileStorageService,
  embeddingPipeline: EmbeddingPipelineService
): Promise<void> {
  /**
   * POST /api/capture
   * Capture content (text, images, PDFs)
   * Supports both JSON (text) and multipart/form-data (files)
   */
  fastify.post(
    '/api/capture',
    async (request: FastifyRequest, _reply: FastifyReply): Promise<CaptureResponse> => {
      // Check if this is a multipart request (file upload)
      if (request.isMultipart()) {
        return await handleFileUpload(request, fileStorage, embeddingPipeline);
      } else {
        // Handle JSON text content
        return await handleTextCapture(request, fileStorage, embeddingPipeline);
      }
    }
  );

  logger.info('Capture routes registered');
}

/**
 * Handle text content capture (JSON)
 */
async function handleTextCapture(
  request: FastifyRequest,
  fileStorage: FileStorageService,
  embeddingPipeline: EmbeddingPipelineService
): Promise<CaptureResponse> {
  const { content, title, annotation, tags } = request.body as CaptureTextRequest;

  logger.info('Text capture request received', {
    contentType: 'text',
    hasTitle: !!title,
    hasAnnotation: !!annotation,
    tagCount: tags?.length || 0,
    contentLength: content?.length || 0,
  });

  // Validate content is not empty (after trimming)
  if (!content || content.trim().length === 0) {
    logger.warn('Empty content in capture request');
    throw ApiErrors.validationError('Content cannot be empty');
  }

  // Validate tags format if provided
  if (tags && tags.length > 0) {
    validateTags(tags);
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

    // Trigger async embedding generation (non-blocking)
    embeddingPipeline.processContentAsync({
      contentId: result.id!,
      contentType: 'text',
      content,
      annotation,
      title,
      tags,
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

/**
 * Handle file upload (multipart/form-data)
 */
async function handleFileUpload(
  request: FastifyRequest,
  fileStorage: FileStorageService,
  embeddingPipeline: EmbeddingPipelineService
): Promise<CaptureResponse> {
  try {
    let file: MultipartFile | null = null;
    const metadata: FileUploadMetadata = {};

    // Parse all multipart parts
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        file = part as MultipartFile;
      } else if (part.type === 'field') {
        const fieldName = part.fieldname;
        const value = (part as any).value;

        if (fieldName === 'metadata') {
          try {
            const parsed = JSON.parse(value);
            Object.assign(metadata, parsed);
          } catch (e) {
            logger.warn('Failed to parse metadata field', { value });
          }
        }
      }
    }

    if (!file) {
      logger.warn('No file in multipart request');
      throw ApiErrors.validationError('No file provided');
    }

    logger.info('File upload request received', {
      filename: file.filename,
      mimeType: file.mimetype,
      encoding: file.encoding,
      hasMetadata: Object.keys(metadata).length > 0,
      metadata,
    });

    // Determine content type from MIME type
    let contentType: ContentType | undefined = metadata.contentType;
    if (!contentType) {
      contentType = getContentTypeFromMime(file.mimetype);
    }

    if (!contentType) {
      logger.warn('Unsupported file type', { mimeType: file.mimetype });
      throw ApiErrors.validationError(
        `Unsupported file type: ${file.mimetype}. Supported types: JPEG, PNG, PDF`
      );
    }

    // Validate tags if provided
    if (metadata.tags && metadata.tags.length > 0) {
      validateTags(metadata.tags);
    }

    // Read file content into buffer
    const fileBuffer = await file.toBuffer();

    logger.debug('File buffered', {
      size: fileBuffer.length,
      contentType,
    });

    // Save file using file storage service
    const result = await fileStorage.saveFile({
      content: fileBuffer,
      contentType,
      title: metadata.title,
      annotation: metadata.annotation,
      tags: metadata.tags,
      originalFilename: file.filename,
      mimeType: file.mimetype,
    });

    if (!result.success) {
      logger.error('Failed to save file', { error: result.error });
      throw ApiErrors.storageError(result.error || 'Failed to save file');
    }

    logger.info('File uploaded successfully', {
      id: result.id,
      filePath: result.filePath,
      contentType,
      originalFilename: file.filename,
    });

    // Trigger async embedding generation (non-blocking)
    embeddingPipeline.processContentAsync({
      contentId: result.id!,
      contentType,
      content: fileBuffer,
      annotation: metadata.annotation,
      title: metadata.title,
      originalFilename: file.filename,
      tags: metadata.tags,
    });

    return {
      success: true,
      id: result.id!,
      message: 'File uploaded successfully',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // If it's already an API error, re-throw it
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    // Otherwise, wrap it as a storage error
    logger.error('Unexpected error in file upload endpoint', { error });
    throw ApiErrors.storageError(
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}
