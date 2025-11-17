/**
 * KURA Notes - Search Service
 *
 * Provides unified search functionality combining vector search and FTS
 * Handles search ranking, score normalization, and result deduplication
 */

import { DatabaseService } from './database/database.service.js';
import { EmbeddingService } from './embeddingService.js';
import { VectorStoreService } from './vectorStore.js';
import { logger } from '../utils/logger.js';
import type { Content, ContentType, SearchFilters } from '../models/content.js';

/**
 * Search result with normalized score
 */
export interface SearchResult {
  id: string;
  title: string | null;
  excerpt: string;
  contentType: ContentType;
  relevanceScore: number; // Normalized to 0-1
  searchMethod: 'vector' | 'fts' | 'combined';
  metadata: {
    tags: string[];
    createdAt: string;
    updatedAt: string;
    source: string | null;
    annotation: string | null;
    imageMetadata?: any;
    pdfMetadata?: any;
  };
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  limit?: number;
  useFallback?: boolean; // Whether to fall back to FTS if vector search fails
  combineResults?: boolean; // Whether to combine both vector and FTS results
  filters?: SearchFilters; // Optional filters to apply to results
}

/**
 * Search service class
 * Provides unified search functionality across vector and FTS
 */
export class SearchService {
  private db: DatabaseService;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStoreService;

  constructor(
    db: DatabaseService,
    embeddingService: EmbeddingService,
    vectorStore: VectorStoreService
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    logger.debug('Search service initialized');
  }

  /**
   * Perform full-text search using SQLite FTS5
   * Returns results with snippets
   */
  public async performFTSSearch(query: string, limit = 10): Promise<SearchResult[]> {
    logger.debug('Performing FTS search', { query, limit });

    try {
      // Search using the database service
      const results = this.db.searchContent(query, limit);

      logger.info('FTS search completed', {
        query,
        resultsFound: results.length,
      });

      // Convert to SearchResult format with snippets
      return results.map((content) => this.contentToSearchResult(content, 'fts', 1.0));
    } catch (error) {
      logger.error('FTS search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
      });
      throw error;
    }
  }

  /**
   * Perform vector search using ChromaDB
   */
  public async performVectorSearch(query: string, limit = 10): Promise<SearchResult[]> {
    logger.debug('Performing vector search', { query, limit });

    try {
      // Check if embedding service is available
      if (!this.embeddingService.isAvailable()) {
        throw new Error('Embedding service not available');
      }

      // Generate embedding for query
      const embeddingResult = await this.embeddingService.generateEmbedding(query);

      // Search vector store
      const vectorResults = await this.vectorStore.queryByEmbedding(
        embeddingResult.embedding,
        limit
      );

      logger.info('Vector search completed', {
        query,
        resultsFound: vectorResults.length,
      });

      // Convert to SearchResult format
      const searchResults: SearchResult[] = [];

      for (const vectorResult of vectorResults) {
        const content = this.db.getContentById(vectorResult.id);

        if (!content) {
          logger.warn('Content found in vector store but not in database', {
            id: vectorResult.id,
          });
          continue;
        }

        searchResults.push(
          this.contentToSearchResult(content, 'vector', vectorResult.score)
        );
      }

      return searchResults;
    } catch (error) {
      logger.error('Vector search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
      });
      throw error;
    }
  }

  /**
   * Apply filters to search results
   * Filters by content type, tags, and date range
   */
  private applyFilters(results: SearchResult[], filters: SearchFilters): SearchResult[] {
    if (!filters || Object.keys(filters).length === 0) {
      return results;
    }

    logger.debug('Applying filters to search results', {
      resultsCount: results.length,
      filters,
    });

    let filteredResults = results;

    // Filter by content type
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      filteredResults = filteredResults.filter((result) =>
        filters.contentTypes!.includes(result.contentType)
      );

      logger.debug('Applied contentType filter', {
        contentTypes: filters.contentTypes,
        remainingResults: filteredResults.length,
      });
    }

    // Filter by tags (result must have ALL specified tags)
    if (filters.tags && filters.tags.length > 0) {
      filteredResults = filteredResults.filter((result) => {
        const resultTags = result.metadata.tags;
        return filters.tags!.every((tag) => resultTags.includes(tag));
      });

      logger.debug('Applied tags filter', {
        tags: filters.tags,
        remainingResults: filteredResults.length,
      });
    }

    // Filter by date range (created_at)
    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      filteredResults = filteredResults.filter((result) => {
        const createdAt = new Date(result.metadata.createdAt);
        return createdAt >= dateFrom;
      });

      logger.debug('Applied dateFrom filter', {
        dateFrom: filters.dateFrom,
        remainingResults: filteredResults.length,
      });
    }

    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      filteredResults = filteredResults.filter((result) => {
        const createdAt = new Date(result.metadata.createdAt);
        return createdAt <= dateTo;
      });

      logger.debug('Applied dateTo filter', {
        dateTo: filters.dateTo,
        remainingResults: filteredResults.length,
      });
    }

    logger.info('Filters applied', {
      originalCount: results.length,
      filteredCount: filteredResults.length,
      filters,
    });

    return filteredResults;
  }

  /**
   * Unified search with automatic fallback
   * Tries vector search first, falls back to FTS if needed
   */
  public async search(options: SearchOptions): Promise<{
    results: SearchResult[];
    searchMethod: 'vector' | 'fts' | 'combined';
    totalResults: number;
  }> {
    const { query, limit = 10, useFallback = true, combineResults = false, filters } = options;

    logger.debug('Unified search starting', { query, limit, useFallback, combineResults });

    let vectorResults: SearchResult[] = [];
    let ftsResults: SearchResult[] = [];
    let searchMethod: 'vector' | 'fts' | 'combined' = 'vector';

    // Try vector search first
    try {
      vectorResults = await this.performVectorSearch(query, limit);

      // If we have results and not combining, return vector results
      if (vectorResults.length > 0 && !combineResults) {
        logger.info('Returning vector search results', {
          query,
          resultsCount: vectorResults.length,
        });

        // Log search query
        this.logSearchQuery(query, vectorResults.length);

        return {
          results: vectorResults,
          searchMethod: 'vector',
          totalResults: vectorResults.length,
        };
      }

      // If combining, also run FTS
      if (combineResults) {
        logger.debug('Running FTS search for combination', { query });
        try {
          ftsResults = await this.performFTSSearch(query, limit);
        } catch (ftsError) {
          logger.warn('FTS search failed during combination', {
            error: ftsError instanceof Error ? ftsError.message : 'Unknown error',
          });
        }
      }

      // If no vector results but fallback enabled, try FTS
      if (vectorResults.length === 0 && useFallback) {
        logger.info('Vector search returned no results, falling back to FTS', { query });
        searchMethod = 'fts';
      }
    } catch (vectorError) {
      // Vector search failed, fall back to FTS if enabled
      if (useFallback) {
        logger.warn('Vector search failed, falling back to FTS', {
          error: vectorError instanceof Error ? vectorError.message : 'Unknown error',
          query,
        });
        searchMethod = 'fts';
      } else {
        // No fallback, re-throw error
        throw vectorError;
      }
    }

    // If we need FTS results (fallback or no vector results)
    if (searchMethod === 'fts' && ftsResults.length === 0) {
      ftsResults = await this.performFTSSearch(query, limit);
    }

    // Combine and deduplicate results if needed
    let finalResults: SearchResult[];

    if (vectorResults.length > 0 && ftsResults.length > 0) {
      logger.debug('Combining vector and FTS results', {
        vectorCount: vectorResults.length,
        ftsCount: ftsResults.length,
      });

      finalResults = this.combineAndDeduplicateResults(vectorResults, ftsResults, limit);
      searchMethod = 'combined';
    } else if (vectorResults.length > 0) {
      finalResults = vectorResults;
      searchMethod = 'vector';
    } else {
      finalResults = ftsResults;
      searchMethod = 'fts';
    }

    // Update search method in results
    finalResults = finalResults.map((result) => ({
      ...result,
      searchMethod,
    }));

    // Apply filters if provided
    if (filters && Object.keys(filters).length > 0) {
      finalResults = this.applyFilters(finalResults, filters);
    }

    logger.info('Unified search completed', {
      query,
      searchMethod,
      totalResults: finalResults.length,
      filtersApplied: filters ? Object.keys(filters).length : 0,
    });

    // Log search query
    this.logSearchQuery(query, finalResults.length);

    return {
      results: finalResults,
      searchMethod,
      totalResults: finalResults.length,
    };
  }

  /**
   * Combine results from vector and FTS search, normalize scores, and deduplicate
   */
  private combineAndDeduplicateResults(
    vectorResults: SearchResult[],
    ftsResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    logger.debug('Combining and deduplicating results', {
      vectorCount: vectorResults.length,
      ftsCount: ftsResults.length,
      limit,
    });

    // Normalize scores for both result sets
    const normalizedVector = this.normalizeScores(vectorResults);
    const normalizedFTS = this.normalizeScores(ftsResults);

    // Create a map to deduplicate by ID
    const resultsMap = new Map<string, SearchResult>();

    // Add vector results first (they have higher priority)
    for (const result of normalizedVector) {
      resultsMap.set(result.id, result);
    }

    // Add FTS results, combining scores if duplicate
    for (const result of normalizedFTS) {
      if (resultsMap.has(result.id)) {
        // Duplicate found - combine scores (average)
        const existing = resultsMap.get(result.id)!;
        const combinedScore = (existing.relevanceScore + result.relevanceScore) / 2;

        resultsMap.set(result.id, {
          ...existing,
          relevanceScore: combinedScore,
          searchMethod: 'combined' as const,
        });

        logger.debug('Combined duplicate result', {
          id: result.id,
          vectorScore: existing.relevanceScore,
          ftsScore: result.relevanceScore,
          combinedScore,
        });
      } else {
        // New result from FTS
        resultsMap.set(result.id, result);
      }
    }

    // Convert map to array and sort by score
    const combined = Array.from(resultsMap.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );

    // Limit results
    const limited = combined.slice(0, limit);

    logger.debug('Results combined and deduplicated', {
      originalCount: vectorResults.length + ftsResults.length,
      deduplicatedCount: combined.length,
      finalCount: limited.length,
    });

    return limited;
  }

  /**
   * Normalize scores to 0-1 range
   * Handles both vector similarity scores and FTS rank scores
   */
  private normalizeScores(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) {
      return results;
    }

    // Find min and max scores
    const scores = results.map((r) => r.relevanceScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    // If all scores are the same, return as is
    if (minScore === maxScore) {
      return results.map((r) => ({
        ...r,
        relevanceScore: 1.0,
      }));
    }

    // Normalize to 0-1 range
    return results.map((result) => ({
      ...result,
      relevanceScore: (result.relevanceScore - minScore) / (maxScore - minScore),
    }));
  }

  /**
   * Generate excerpt with context highlighting
   * Extracts snippet around search terms
   */
  public generateSnippet(
    content: Content,
    query: string,
    maxLength = 200
  ): string {
    // For images and PDFs, prefer annotation
    if (content.content_type === 'image' || content.content_type === 'pdf') {
      if (content.annotation && content.annotation.trim()) {
        return this.truncateText(content.annotation, maxLength);
      }
    }

    // Try to find query terms in text
    const searchableText = [
      content.title || '',
      content.annotation || '',
      content.extracted_text || '',
    ]
      .filter((text) => text.length > 0)
      .join(' ');

    if (!searchableText.trim()) {
      return `[${content.content_type} content - no excerpt available]`;
    }

    // Simple snippet extraction - find first occurrence of any query term
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = searchableText.toLowerCase();

    let bestPosition = -1;
    for (const term of queryTerms) {
      const position = textLower.indexOf(term);
      if (position !== -1 && (bestPosition === -1 || position < bestPosition)) {
        bestPosition = position;
      }
    }

    // If query term found, extract context around it
    if (bestPosition !== -1) {
      const start = Math.max(0, bestPosition - 50);
      const end = Math.min(searchableText.length, bestPosition + maxLength - 50);

      let snippet = searchableText.substring(start, end);

      // Add ellipsis if truncated
      if (start > 0) {
        snippet = '...' + snippet;
      }
      if (end < searchableText.length) {
        snippet = snippet + '...';
      }

      return snippet.trim();
    }

    // No query term found, return beginning of text
    return this.truncateText(searchableText, maxLength);
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + '...';
  }

  /**
   * Convert Content to SearchResult
   */
  private contentToSearchResult(
    content: Content,
    searchMethod: 'vector' | 'fts',
    score: number
  ): SearchResult {
    const excerpt = this.generateSnippet(content, '', 200);

    return {
      id: content.id,
      title: content.title,
      excerpt,
      contentType: content.content_type,
      relevanceScore: score,
      searchMethod,
      metadata: {
        tags: content.tags,
        createdAt: content.created_at,
        updatedAt: content.updated_at,
        source: content.source,
        annotation: content.annotation,
        imageMetadata: content.image_metadata,
        pdfMetadata: content.pdf_metadata,
      },
    };
  }

  /**
   * Log search query to history
   */
  private logSearchQuery(query: string, resultsCount: number): void {
    try {
      this.db.saveSearchHistory(query, resultsCount);
      logger.debug('Search query logged', { query, resultsCount });
    } catch (error) {
      logger.warn('Failed to log search query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
      });
    }
  }

  /**
   * Get recent search history
   */
  public getSearchHistory(limit = 10) {
    return this.db.getSearchHistory(limit);
  }
}
