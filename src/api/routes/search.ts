/**
 * KURA Notes - Search Routes
 *
 * Endpoints for vector-based semantic search
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { DatabaseService } from '../../services/database/database.service.js';
import { EmbeddingService } from '../../services/embeddingService.js';
import { VectorStoreService } from '../../services/vectorStore.js';
import { ApiErrors } from '../types/errors.js';
import type { ContentType } from '../../models/content.js';

/**
 * Search result item
 */
interface SearchResultItem {
  id: string;
  title: string | null;
  excerpt: string;
  contentType: ContentType;
  relevanceScore: number;
  metadata: {
    tags: string[];
    createdAt: string;
    updatedAt: string;
    source: string | null;
    annotation: string | null;
  };
}

/**
 * Search response
 */
interface SearchResponse {
  results: SearchResultItem[];
  totalResults: number;
  query: string;
  timestamp: string;
}

/**
 * Query parameters for search endpoint
 */
interface SearchQueryParams {
  query: string;
  limit?: string; // Query params are always strings
}

/**
 * Schema for GET /api/search
 */
const searchSchema = {
  querystring: {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: 'Natural language search query',
      },
      limit: {
        type: 'string',
        pattern: '^[0-9]+$',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['results', 'totalResults', 'query', 'timestamp'],
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title', 'excerpt', 'contentType', 'relevanceScore', 'metadata'],
            properties: {
              id: { type: 'string' },
              title: { type: ['string', 'null'] },
              excerpt: { type: 'string' },
              contentType: { type: 'string', enum: ['text', 'image', 'pdf', 'audio'] },
              relevanceScore: { type: 'number', minimum: 0, maximum: 1 },
              metadata: {
                type: 'object',
                properties: {
                  tags: { type: 'array', items: { type: 'string' } },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  source: { type: ['string', 'null'] },
                  annotation: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
        totalResults: { type: 'number' },
        query: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};

/**
 * Generate excerpt from content
 * Takes first 200 characters or uses annotation if available
 */
function generateExcerpt(
  extractedText: string | null,
  annotation: string | null,
  contentType: ContentType
): string {
  // For images and PDFs, prefer annotation
  if (contentType === 'image' || contentType === 'pdf') {
    if (annotation && annotation.trim()) {
      return annotation.length > 200 ? annotation.substring(0, 200) + '...' : annotation;
    }
  }

  // Try annotation first
  if (annotation && annotation.trim()) {
    return annotation.length > 200 ? annotation.substring(0, 200) + '...' : annotation;
  }

  // Fall back to extracted text
  if (extractedText && extractedText.trim()) {
    return extractedText.length > 200 ? extractedText.substring(0, 200) + '...' : extractedText;
  }

  // Default fallback
  return `[${contentType} content - no excerpt available]`;
}

/**
 * Register search routes
 */
export async function registerSearchRoutes(
  fastify: FastifyInstance,
  db: DatabaseService,
  embeddingService: EmbeddingService,
  vectorStore: VectorStoreService
): Promise<void> {
  /**
   * GET /api/search
   * Search for content using natural language query
   */
  fastify.get<{ Querystring: SearchQueryParams }>(
    '/api/search',
    {
      schema: searchSchema,
    },
    async (
      request: FastifyRequest<{ Querystring: SearchQueryParams }>,
      _reply: FastifyReply
    ): Promise<SearchResponse> => {
      const { query, limit: limitStr } = request.query;

      logger.debug('Search request received', { query, limit: limitStr });

      // Validate and parse limit parameter
      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      if (isNaN(limit) || limit < 1 || limit > 50) {
        logger.warn('Invalid limit parameter', { limit: limitStr });
        throw ApiErrors.validationError(
          'Limit must be a number between 1 and 50',
          { limit: limitStr }
        );
      }

      // Validate query parameter
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        logger.warn('Empty search query provided');
        throw ApiErrors.validationError('Search query cannot be empty');
      }

      try {
        // Check if embedding service is available
        if (!embeddingService.isAvailable()) {
          logger.error('Embedding service not available for search');
          throw ApiErrors.serviceUnavailable('Embedding service');
        }

        // Generate embedding for the search query
        logger.debug('Generating embedding for search query', { query: trimmedQuery });
        const embeddingResult = await embeddingService.generateEmbedding(trimmedQuery);

        // Search ChromaDB using the query embedding
        logger.debug('Querying vector store', { limit });
        const vectorResults = await vectorStore.queryByEmbedding(embeddingResult.embedding, limit);

        logger.info('Vector search completed', {
          query: trimmedQuery,
          resultsFound: vectorResults.length,
          limit,
        });

        // If no results found, return empty array
        if (vectorResults.length === 0) {
          logger.debug('No results found for query', { query: trimmedQuery });
          return {
            results: [],
            totalResults: 0,
            query: trimmedQuery,
            timestamp: new Date().toISOString(),
          };
        }

        // Retrieve full metadata from SQLite for each result
        const searchResults: SearchResultItem[] = [];

        for (const vectorResult of vectorResults) {
          const content = db.getContentById(vectorResult.id);

          // Skip if content not found in database (edge case: deleted after indexing)
          if (!content) {
            logger.warn('Content found in vector store but not in database', {
              id: vectorResult.id,
            });
            continue;
          }

          // Generate excerpt
          const excerpt = generateExcerpt(
            content.extracted_text,
            content.annotation,
            content.content_type
          );

          // Build search result item
          searchResults.push({
            id: content.id,
            title: content.title,
            excerpt,
            contentType: content.content_type,
            relevanceScore: vectorResult.score,
            metadata: {
              tags: content.tags,
              createdAt: content.created_at,
              updatedAt: content.updated_at,
              source: content.source,
              annotation: content.annotation,
            },
          });
        }

        // Results are already sorted by relevance score (ChromaDB returns sorted by similarity)
        logger.info('Search results prepared', {
          query: trimmedQuery,
          totalResults: searchResults.length,
        });

        return {
          results: searchResults,
          totalResults: searchResults.length,
          query: trimmedQuery,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        // Handle specific error types
        if (error instanceof Error) {
          // ChromaDB errors
          if (error.message.includes('ChromaDB') || error.message.includes('Collection')) {
            logger.error('ChromaDB error during search', {
              error: error.message,
              query: trimmedQuery,
            });
            throw ApiErrors.serviceUnavailable('Vector store');
          }

          // Embedding errors
          if (error.message.includes('embedding') || error.message.includes('OpenAI')) {
            logger.error('Embedding generation error during search', {
              error: error.message,
              query: trimmedQuery,
            });
            throw ApiErrors.serviceUnavailable('Embedding service');
          }

          // Database errors
          if (error.message.includes('database') || error.message.includes('SQLite')) {
            logger.error('Database error during search', {
              error: error.message,
              query: trimmedQuery,
            });
            throw ApiErrors.databaseError('Failed to retrieve search results metadata');
          }
        }

        // Generic error
        logger.error('Unexpected error during search', {
          error: error instanceof Error ? error.message : 'Unknown error',
          query: trimmedQuery,
        });

        throw ApiErrors.internalError(
          error instanceof Error ? error.message : 'Search operation failed'
        );
      }
    }
  );

  logger.info('Search routes registered');
}
