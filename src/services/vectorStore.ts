/**
 * KURA Notes - Vector Store Service
 *
 * Manages ChromaDB vector storage for semantic search
 * Implements connection, collection management, and CRUD operations
 */

import { ChromaClient, Collection } from 'chromadb';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Document interface for ChromaDB
 */
export interface VectorDocument {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
  text: string;
}

/**
 * Query result from vector search
 */
export interface QueryResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
  text: string;
}

/**
 * Vector store service configuration
 */
interface VectorStoreConfig {
  url: string;
  collectionName: string;
}

/**
 * Vector Store Service
 * Singleton pattern - use getInstance() to get the instance
 */
export class VectorStoreService {
  private static instance: VectorStoreService | null = null;
  private client: ChromaClient;
  private collection: Collection | null = null;
  private config: VectorStoreConfig;
  private isConnected = false;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(config: VectorStoreConfig) {
    this.config = config;
    this.client = new ChromaClient({
      path: config.url,
    });

    logger.info('VectorStoreService initialized', {
      url: config.url,
      collection: config.collectionName,
    });
  }

  /**
   * Get or create vector store instance (singleton)
   */
  public static getInstance(userConfig?: VectorStoreConfig): VectorStoreService {
    if (!VectorStoreService.instance) {
      if (!userConfig) {
        // Use default config from environment
        userConfig = {
          url: config.vectorStoreUrl || 'http://localhost:8000',
          collectionName: 'knowledge_base',
        };
      }
      VectorStoreService.instance = new VectorStoreService(userConfig);
    }
    return VectorStoreService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (VectorStoreService.instance) {
      VectorStoreService.instance = null;
    }
  }

  /**
   * Initialize connection and create/get collection
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing ChromaDB connection...');

      // Get or create collection with cosine similarity
      this.collection = await this.client.getOrCreateCollection({
        name: this.config.collectionName,
        metadata: {
          description: 'KURA Notes knowledge base for semantic search',
          'hnsw:space': 'cosine', // Use cosine similarity for distance metric
        },
      });

      this.isConnected = true;

      logger.info('ChromaDB collection ready', {
        name: this.config.collectionName,
        distanceMetric: 'cosine',
      });
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to initialize ChromaDB', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `ChromaDB initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Health check for ChromaDB connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get collection count as a simple health check
      if (!this.collection) {
        await this.initialize();
      }

      if (this.collection) {
        await this.collection.count();
        this.isConnected = true;
        return true;
      }

      return false;
    } catch (error) {
      this.isConnected = false;
      logger.debug('ChromaDB health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Add a document with embedding to the collection
   */
  async addDocument(
    id: string,
    embedding: number[],
    metadata: Record<string, any>,
    text: string
  ): Promise<void> {
    try {
      if (!this.collection) {
        await this.initialize();
      }

      if (!this.collection) {
        throw new Error('Collection not initialized');
      }

      await this.collection.add({
        ids: [id],
        embeddings: [embedding],
        metadatas: [metadata],
        documents: [text],
      });

      logger.debug('Document added to ChromaDB', { id });
    } catch (error) {
      logger.error('Failed to add document to ChromaDB', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `Failed to add document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Query documents by embedding vector
   */
  async queryByEmbedding(embedding: number[], limit = 10): Promise<QueryResult[]> {
    try {
      if (!this.collection) {
        await this.initialize();
      }

      if (!this.collection) {
        throw new Error('Collection not initialized');
      }

      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: limit,
      });

      // Transform ChromaDB results to our format
      const queryResults: QueryResult[] = [];

      if (
        results.ids &&
        results.ids[0] &&
        results.distances &&
        results.distances[0] &&
        results.metadatas &&
        results.metadatas[0] &&
        results.documents &&
        results.documents[0]
      ) {
        for (let i = 0; i < results.ids[0].length; i++) {
          // Convert distance to similarity score (cosine distance -> similarity)
          // Cosine distance: 0 = identical, 2 = opposite
          // Cosine similarity: 1 = identical, -1 = opposite
          const distance = results.distances[0][i] ?? 0;
          const similarity = 1 - distance / 2;

          const id = results.ids[0][i];
          const text = results.documents[0][i];

          if (id && text) {
            queryResults.push({
              id,
              score: similarity,
              metadata: results.metadatas[0][i] as Record<string, any>,
              text,
            });
          }
        }
      }

      logger.debug('Query completed', { resultCount: queryResults.length, limit });

      return queryResults;
    } catch (error) {
      logger.error('Failed to query ChromaDB', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `Failed to query documents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a document from the collection
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      if (!this.collection) {
        await this.initialize();
      }

      if (!this.collection) {
        throw new Error('Collection not initialized');
      }

      await this.collection.delete({
        ids: [id],
      });

      logger.debug('Document deleted from ChromaDB', { id });
    } catch (error) {
      logger.error('Failed to delete document from ChromaDB', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a document by ID
   */
  async getDocument(id: string): Promise<VectorDocument | null> {
    try {
      if (!this.collection) {
        await this.initialize();
      }

      if (!this.collection) {
        throw new Error('Collection not initialized');
      }

      const results = await this.collection.get({
        ids: [id],
        include: ['embeddings' as any, 'metadatas' as any, 'documents' as any],
      });

      if (!results.ids || results.ids.length === 0) {
        return null;
      }

      const docId = results.ids[0];
      const docText = results.documents?.[0];

      if (!docId || !docText) {
        return null;
      }

      return {
        id: docId,
        embedding: results.embeddings?.[0] as number[],
        metadata: results.metadatas?.[0] as Record<string, any>,
        text: docText,
      };
    } catch (error) {
      logger.error('Failed to get document from ChromaDB', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `Failed to get document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get collection stats
   */
  async getStats(): Promise<{ count: number; isConnected: boolean }> {
    try {
      if (!this.collection) {
        await this.initialize();
      }

      if (!this.collection) {
        return { count: 0, isConnected: false };
      }

      const count = await this.collection.count();

      return {
        count,
        isConnected: this.isConnected,
      };
    } catch (error) {
      logger.error('Failed to get collection stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { count: 0, isConnected: false };
    }
  }
}

/**
 * Get the vector store service instance
 */
export function getVectorStoreService(): VectorStoreService {
  return VectorStoreService.getInstance({
    url: config.vectorStoreUrl,
    collectionName: 'knowledge_base',
  });
}
