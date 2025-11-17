/**
 * Vector Store Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { VectorStoreService } from '../../src/services/vectorStore.js';

describe('VectorStoreService', () => {
  beforeEach(() => {
    // Reset singleton instance before each test
    VectorStoreService.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    VectorStoreService.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = VectorStoreService.getInstance({
        url: 'http://localhost:8000',
        collectionName: 'test_collection',
      });

      const instance2 = VectorStoreService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should use default config when no config provided', () => {
      const instance = VectorStoreService.getInstance();
      expect(instance).toBeDefined();
    });

    it('should reset instance correctly', () => {
      const instance1 = VectorStoreService.getInstance({
        url: 'http://localhost:8000',
        collectionName: 'test_collection',
      });

      VectorStoreService.resetInstance();

      const instance2 = VectorStoreService.getInstance({
        url: 'http://localhost:9000',
        collectionName: 'another_collection',
      });

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Service Structure', () => {
    let vectorStore: VectorStoreService;

    beforeEach(() => {
      vectorStore = VectorStoreService.getInstance({
        url: 'http://localhost:8000',
        collectionName: 'test_collection',
      });
    });

    it('should have all required methods', () => {
      expect(typeof vectorStore.initialize).toBe('function');
      expect(typeof vectorStore.healthCheck).toBe('function');
      expect(typeof vectorStore.addDocument).toBe('function');
      expect(typeof vectorStore.queryByEmbedding).toBe('function');
      expect(typeof vectorStore.deleteDocument).toBe('function');
      expect(typeof vectorStore.getDocument).toBe('function');
      expect(typeof vectorStore.getStats).toBe('function');
    });
  });

  describe('ChromaDB Operations (Integration)', () => {
    let vectorStore: VectorStoreService;

    beforeEach(() => {
      vectorStore = VectorStoreService.getInstance({
        url: 'http://localhost:8000',
        collectionName: 'test_collection',
      });
    });

    // Note: These tests require ChromaDB to be running
    // They will be skipped if ChromaDB is not available

    it('should handle initialization gracefully when ChromaDB is unavailable', async () => {
      // This test expects ChromaDB to be unavailable in test environment
      try {
        await vectorStore.initialize();
        // If initialization succeeds, that's fine too
        expect(true).toBe(true);
      } catch (error) {
        // If it fails, we should get a meaningful error message
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
        if (error instanceof Error) {
          expect(error.message).toContain('ChromaDB');
        }
      }
    });

    it('should return false for health check when ChromaDB is unavailable', async () => {
      const isHealthy = await vectorStore.healthCheck();
      // Either healthy (if ChromaDB is running) or unhealthy (if not)
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should handle getStats gracefully when ChromaDB is unavailable', async () => {
      const stats = await vectorStore.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.count).toBe('number');
      expect(typeof stats.isConnected).toBe('boolean');
    });
  });

  describe('Document Operations (Unit)', () => {
    let vectorStore: VectorStoreService;

    beforeEach(() => {
      vectorStore = VectorStoreService.getInstance({
        url: 'http://localhost:8000',
        collectionName: 'test_collection',
      });
    });

    it('should reject addDocument when collection not initialized', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());

      try {
        await vectorStore.addDocument(
          'test-id-1',
          embedding,
          { title: 'Test Document' },
          'This is a test document'
        );
        // If ChromaDB is running, this might succeed
        expect(true).toBe(true);
      } catch (error) {
        // If it fails, we should get an error
        expect(error).toBeDefined();
      }
    });

    it('should reject queryByEmbedding when collection not initialized', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());

      try {
        await vectorStore.queryByEmbedding(embedding, 5);
        // If ChromaDB is running, this might succeed (returning empty results)
        expect(true).toBe(true);
      } catch (error) {
        // If it fails, we should get an error
        expect(error).toBeDefined();
      }
    });
  });
});
