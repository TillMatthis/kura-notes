/**
 * KURA Notes - Embedding Pipeline Service
 *
 * Orchestrates embedding generation and storage in ChromaDB
 * Handles async processing and status tracking
 */

import { logger } from '../utils/logger.js';
import { EmbeddingService } from './embeddingService.js';
import { VectorStoreService } from './vectorStore.js';
import { DatabaseService } from './database/database.service.js';
import { extractTextForEmbedding, validateEmbeddingText } from '../utils/textExtraction.js';
import type { ContentType } from '../models/content.js';

/**
 * Input for embedding generation
 */
export interface EmbeddingPipelineInput {
  contentId: string;
  userId: string; // KOauth user ID (required for multi-user support)
  contentType: ContentType;
  content: string | Buffer;
  annotation?: string | null;
  title?: string | null;
  originalFilename?: string;
  tags?: string[];
}

/**
 * Embedding Pipeline Service
 * Orchestrates embedding generation and storage
 */
export class EmbeddingPipelineService {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStoreService;
  private database: DatabaseService;

  constructor(
    embeddingService: EmbeddingService,
    vectorStore: VectorStoreService,
    database: DatabaseService
  ) {
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.database = database;

    logger.info('EmbeddingPipelineService initialized');
  }

  /**
   * Process content and generate embedding asynchronously
   * This runs in the background and doesn't block the capture response
   *
   * @param input - Content to process
   */
  async processContentAsync(input: EmbeddingPipelineInput): Promise<void> {
    const { contentId, contentType } = input;

    logger.info('Starting async embedding generation', {
      contentId,
      contentType,
    });

    // Don't await - run in background
    this.processContent(input).catch((error) => {
      logger.error('Async embedding generation failed', {
        contentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }

  /**
   * Process content and generate embedding (actual implementation)
   *
   * @param input - Content to process
   */
  private async processContent(input: EmbeddingPipelineInput): Promise<void> {
    const { contentId, userId, contentType, content, annotation, title, originalFilename, tags } = input;

    try {
      // Check if embedding service is available
      if (!this.embeddingService.isAvailable()) {
        logger.warn('Embedding service not available (OpenAI API key not configured)', {
          contentId,
          userId,
        });
        // Update status to failed with a specific reason
        this.database.updateContent(contentId, userId, {
          embedding_status: 'failed',
        });
        return;
      }

      // Extract text for embedding based on content type
      const extractedText = extractTextForEmbedding(
        contentType,
        content,
        annotation,
        title,
        originalFilename
      );

      logger.debug('Text extracted for embedding', {
        contentId,
        extractedLength: extractedText.length,
      });

      // Validate extracted text
      if (!validateEmbeddingText(extractedText)) {
        logger.warn('Extracted text is not suitable for embedding', {
          contentId,
          userId,
          textLength: extractedText.length,
        });
        this.database.updateContent(contentId, userId, {
          embedding_status: 'failed',
        });
        return;
      }

      // Generate embedding
      const embeddingResult = await this.embeddingService.generateEmbedding(extractedText);

      logger.info('Embedding generated successfully', {
        contentId,
        userId,
        dimensions: embeddingResult.dimensions,
        truncated: embeddingResult.truncated,
      });

      // Prepare metadata for ChromaDB (including user_id for filtering)
      const metadata: Record<string, any> = {
        user_id: userId, // Include user_id for multi-user filtering
        content_type: contentType,
        created_at: new Date().toISOString(),
      };

      if (title) {
        metadata.title = title;
      }

      if (annotation) {
        metadata.annotation = annotation;
      }

      if (tags && tags.length > 0) {
        metadata.tags = tags;
      }

      if (originalFilename) {
        metadata.original_filename = originalFilename;
      }

      // Store in ChromaDB
      await this.vectorStore.addDocument(
        contentId,
        embeddingResult.embedding,
        metadata,
        extractedText
      );

      logger.info('Embedding stored in ChromaDB', {
        contentId,
        userId,
      });

      // Update status to completed
      this.database.updateContent(contentId, userId, {
        embedding_status: 'completed',
      });

      logger.info('Embedding pipeline completed successfully', {
        contentId,
        userId,
      });
    } catch (error) {
      logger.error('Embedding pipeline failed', {
        contentId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Update status to failed
      try {
        this.database.updateContent(contentId, userId, {
          embedding_status: 'failed',
        });
      } catch (updateError) {
        logger.error('Failed to update embedding status to failed', {
          contentId,
          error: updateError instanceof Error ? updateError.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Retry failed embeddings
   * Can be called manually or via a scheduled job
   *
   * @param limit - Maximum number of failed embeddings to retry
   */
  async retryFailedEmbeddings(limit = 10): Promise<void> {
    logger.info('Starting retry of failed embeddings', { limit });

    try {
      // Get failed embeddings from database
      const failedContent = this.database.raw(
        'SELECT * FROM content WHERE embedding_status = ? LIMIT ?',
        ['failed', limit]
      ) as any[];

      logger.info('Found failed embeddings to retry', {
        count: failedContent.length,
      });

      for (const content of failedContent) {
        logger.debug('Retrying embedding', { contentId: content.id, userId: content.user_id });

        // Reset status to pending (using user_id from content record)
        this.database.updateContent(content.id, content.user_id, {
          embedding_status: 'pending',
        });

        // This would require reading the file content again
        // For now, we'll log a message
        logger.warn('Retry not fully implemented yet', {
          contentId: content.id,
          userId: content.user_id,
          message: 'Need to read file content and metadata to retry',
        });
      }
    } catch (error) {
      logger.error('Failed to retry embeddings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get embedding statistics
   * @param userId - Optional user ID to scope statistics to user's content (null for all users)
   */
  async getStats(userId: string | null = null): Promise<{
    total: number;
    pending: number;
    completed: number;
    failed: number;
  }> {
    try {
      const total = this.database.getTotalContentCount(userId);

      // Build SQL queries with optional user filtering
      const userFilter = userId ? ' AND user_id = ?' : '';
      const params = userId ? [userId] : [];

      const pending = (
        this.database.raw(
          `SELECT COUNT(*) as count FROM content WHERE embedding_status = ?${userFilter}`,
          ['pending', ...params]
        ) as any[]
      )[0]?.count || 0;

      const completed = (
        this.database.raw(
          `SELECT COUNT(*) as count FROM content WHERE embedding_status = ?${userFilter}`,
          ['completed', ...params]
        ) as any[]
      )[0]?.count || 0;

      const failed = (
        this.database.raw(
          `SELECT COUNT(*) as count FROM content WHERE embedding_status = ?${userFilter}`,
          ['failed', ...params]
        ) as any[]
      )[0]?.count || 0;

      return {
        total,
        pending,
        completed,
        failed,
      };
    } catch (error) {
      logger.error('Failed to get embedding stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        total: 0,
        pending: 0,
        completed: 0,
        failed: 0,
      };
    }
  }
}
