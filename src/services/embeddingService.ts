/**
 * KURA Notes - Embedding Service
 *
 * Generates embeddings from text using OpenAI API
 * Implements retry logic, rate limit handling, and text truncation
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  truncated: boolean;
  originalLength: number;
  processedLength: number;
}

/**
 * Embedding service configuration
 */
interface EmbeddingServiceConfig {
  apiKey: string;
  model: string;
  maxTextLength: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Embedding Service
 * Singleton pattern - use getInstance() to get the instance
 */
export class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private client: OpenAI | null = null;
  private config: EmbeddingServiceConfig;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(userConfig: EmbeddingServiceConfig) {
    this.config = userConfig;

    // Only initialize OpenAI client if API key is provided
    if (userConfig.apiKey) {
      this.client = new OpenAI({
        apiKey: userConfig.apiKey,
      });

      logger.info('EmbeddingService initialized', {
        model: userConfig.model,
        maxTextLength: userConfig.maxTextLength,
        maxRetries: userConfig.maxRetries,
      });
    } else {
      logger.warn('EmbeddingService initialized without API key. Embeddings will not be available.');
    }
  }

  /**
   * Get or create embedding service instance (singleton)
   */
  public static getInstance(userConfig?: EmbeddingServiceConfig): EmbeddingService {
    if (!EmbeddingService.instance) {
      if (!userConfig) {
        // Use default config from environment
        userConfig = {
          apiKey: config.openaiApiKey || '',
          model: config.openaiEmbeddingModel || 'text-embedding-3-small',
          maxTextLength: 8000, // Max 8000 characters
          maxRetries: 3,
          retryDelay: 1000, // 1 second initial delay
        };
      }
      EmbeddingService.instance = new EmbeddingService(userConfig);
    }
    return EmbeddingService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (EmbeddingService.instance) {
      EmbeddingService.instance = null;
    }
  }

  /**
   * Check if the service is available (API key configured)
   */
  public isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Truncate text to maximum length
   */
  private truncateText(text: string): { text: string; truncated: boolean; originalLength: number } {
    const originalLength = text.length;

    if (originalLength <= this.config.maxTextLength) {
      return {
        text,
        truncated: false,
        originalLength,
      };
    }

    // Truncate to max length
    const truncated = text.substring(0, this.config.maxTextLength);

    logger.warn('Text truncated for embedding generation', {
      originalLength,
      truncatedLength: this.config.maxTextLength,
      truncatedPercentage: ((this.config.maxTextLength / originalLength) * 100).toFixed(2),
    });

    return {
      text: truncated,
      truncated: true,
      originalLength,
    };
  }

  /**
   * Generate embedding from text with retry logic
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured. Cannot generate embeddings.');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Truncate text if needed
    const { text: processedText, truncated, originalLength } = this.truncateText(text);

    // Try to generate embedding with retries
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        logger.debug('Generating embedding', {
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          textLength: processedText.length,
          truncated,
        });

        const response = await this.client.embeddings.create({
          model: this.config.model,
          input: processedText,
          encoding_format: 'float',
        });

        // Extract embedding from response
        const embedding = response.data[0]?.embedding;

        if (!embedding || !Array.isArray(embedding)) {
          throw new Error('Invalid embedding response from OpenAI API');
        }

        logger.debug('Embedding generated successfully', {
          dimensions: embedding.length,
          model: this.config.model,
          truncated,
        });

        return {
          embedding,
          dimensions: embedding.length,
          truncated,
          originalLength,
          processedLength: processedText.length,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Check if it's a rate limit error
        const isRateLimitError =
          error instanceof Error &&
          (error.message.includes('rate_limit') || error.message.includes('429'));

        // Check if it's a transient error (network, timeout, etc.)
        const isTransientError =
          error instanceof Error &&
          (error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('network') ||
            isRateLimitError);

        if (isRateLimitError) {
          logger.warn('OpenAI rate limit hit', {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            error: lastError.message,
          });
        } else if (isTransientError) {
          logger.warn('Transient error generating embedding', {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            error: lastError.message,
          });
        } else {
          // Non-transient error, don't retry
          logger.error('Failed to generate embedding', {
            error: lastError.message,
            attempt: attempt + 1,
          });
          throw lastError;
        }

        // Don't retry if we've exhausted attempts
        if (attempt === this.config.maxRetries - 1) {
          break;
        }

        // Calculate exponential backoff delay
        const delay = this.config.retryDelay * Math.pow(2, attempt);

        logger.debug('Retrying after delay', {
          delay,
          nextAttempt: attempt + 2,
        });

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    logger.error('Failed to generate embedding after all retries', {
      maxRetries: this.config.maxRetries,
      error: lastError?.message,
    });

    throw new Error(
      `Failed to generate embedding after ${this.config.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Generate embeddings for multiple texts (batch operation)
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured. Cannot generate embeddings.');
    }

    if (!texts || texts.length === 0) {
      throw new Error('Cannot generate embeddings for empty array');
    }

    logger.debug('Generating embeddings for batch', {
      count: texts.length,
    });

    // Generate embeddings sequentially to avoid rate limits
    // For better performance in production, consider batching with the OpenAI API
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text === undefined) {
        throw new Error(`Text at index ${i} is undefined`);
      }

      try {
        const result = await this.generateEmbedding(text);
        results.push(result);
      } catch (error) {
        logger.error('Failed to generate embedding in batch', {
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    }

    logger.debug('Batch embedding generation completed', {
      count: results.length,
    });

    return results;
  }

  /**
   * Sleep for a given duration (used for retry delays)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Get the embedding service instance
 */
export function getEmbeddingService(): EmbeddingService {
  return EmbeddingService.getInstance({
    apiKey: config.openaiApiKey || '',
    model: config.openaiEmbeddingModel || 'text-embedding-3-small',
    maxTextLength: 8000,
    maxRetries: 3,
    retryDelay: 1000,
  });
}
