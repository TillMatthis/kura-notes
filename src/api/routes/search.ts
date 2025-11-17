/**
 * KURA Notes - Search Routes
 *
 * Endpoints for semantic search with FTS fallback
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { DatabaseService } from '../../services/database/database.service.js';
import { EmbeddingService } from '../../services/embeddingService.js';
import { VectorStoreService } from '../../services/vectorStore.js';
import { SearchService } from '../../services/searchService.js';
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
  searchMethod: 'vector' | 'fts' | 'combined';
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
      required: ['results', 'totalResults', 'query', 'searchMethod', 'timestamp'],
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
        searchMethod: { type: 'string', enum: ['vector', 'fts', 'combined'] },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};

/**
 * Register search routes
 */
export async function registerSearchRoutes(
  fastify: FastifyInstance,
  db: DatabaseService,
  embeddingService: EmbeddingService,
  vectorStore: VectorStoreService
): Promise<void> {
  // Create search service instance
  const searchService = new SearchService(db, embeddingService, vectorStore);

  /**
   * GET /api/search
   * Search for content using natural language query with FTS fallback
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
        // Use the unified search service with automatic fallback
        const searchResult = await searchService.search({
          query: trimmedQuery,
          limit,
          useFallback: true, // Enable FTS fallback
          combineResults: false, // Don't combine for now (can be made configurable)
        });

        logger.info('Search completed successfully', {
          query: trimmedQuery,
          searchMethod: searchResult.searchMethod,
          totalResults: searchResult.totalResults,
        });

        return {
          results: searchResult.results,
          totalResults: searchResult.totalResults,
          query: trimmedQuery,
          searchMethod: searchResult.searchMethod,
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
