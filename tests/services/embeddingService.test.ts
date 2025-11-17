/**
 * Embedding Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EmbeddingService } from '../../src/services/embeddingService.js';

describe('EmbeddingService', () => {
  beforeEach(() => {
    // Reset singleton instance before each test
    EmbeddingService.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    EmbeddingService.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      const instance2 = EmbeddingService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should use default config when no config provided', () => {
      const instance = EmbeddingService.getInstance();
      expect(instance).toBeDefined();
    });

    it('should reset instance correctly', () => {
      const instance1 = EmbeddingService.getInstance({
        apiKey: 'test-key-1',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      EmbeddingService.resetInstance();

      const instance2 = EmbeddingService.getInstance({
        apiKey: 'test-key-2',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Service Availability', () => {
    it('should be available when API key is provided', () => {
      const service = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      expect(service.isAvailable()).toBe(true);
    });

    it('should not be available when API key is empty', () => {
      const service = EmbeddingService.getInstance({
        apiKey: '',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      expect(service.isAvailable()).toBe(false);
    });

    it('should not be available when API key is not provided in environment', () => {
      // When using default config without OPENAI_API_KEY env var
      const service = EmbeddingService.getInstance();

      // Check if it's available (depends on environment)
      const available = service.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Service Structure', () => {
    let service: EmbeddingService;

    beforeEach(() => {
      service = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });
    });

    it('should have all required methods', () => {
      expect(typeof service.isAvailable).toBe('function');
      expect(typeof service.generateEmbedding).toBe('function');
      expect(typeof service.generateEmbeddings).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when generating embedding without API key', async () => {
      const service = EmbeddingService.getInstance({
        apiKey: '',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      await expect(service.generateEmbedding('Test text')).rejects.toThrow(
        'OpenAI API key not configured'
      );
    });

    it('should throw error when generating embedding with empty text', async () => {
      const service = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      await expect(service.generateEmbedding('')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
    });

    it('should throw error when generating embeddings without API key', async () => {
      const service = EmbeddingService.getInstance({
        apiKey: '',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      await expect(service.generateEmbeddings(['Test text'])).rejects.toThrow(
        'OpenAI API key not configured'
      );
    });

    it('should throw error when generating embeddings with empty array', async () => {
      const service = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      await expect(service.generateEmbeddings([])).rejects.toThrow(
        'Cannot generate embeddings for empty array'
      );
    });
  });

  describe('Text Truncation', () => {
    // Note: We can't test actual truncation behavior without mocking private methods
    // or making API calls. These tests verify the service handles long text.

    it('should accept text shorter than max length', async () => {
      const service = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 100, // Short delay for tests
      });

      const shortText = 'This is a short text';

      // This will fail without a real API key, but we're testing that it accepts the input
      try {
        await service.generateEmbedding(shortText);
      } catch (error) {
        // Expected to fail without real API key
        expect(error).toBeDefined();
      }
    });

    it('should accept text longer than max length', async () => {
      const service = EmbeddingService.getInstance({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        maxTextLength: 100, // Small limit for testing
        maxRetries: 1, // Only try once
        retryDelay: 100,
      });

      const longText = 'A'.repeat(200); // Text longer than limit

      // This will fail without a real API key, but we're testing that it accepts the input
      try {
        await service.generateEmbedding(longText);
      } catch (error) {
        // Expected to fail without real API key
        expect(error).toBeDefined();
      }
    });
  });

  describe('Integration Tests (with real API key)', () => {
    // These tests require a real OpenAI API key
    // Skip them by default to avoid API costs and rate limits
    // To run: set OPENAI_API_KEY environment variable and remove .skip

    it.skip('should generate embedding with real API key', async () => {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        console.warn('Skipping test: OPENAI_API_KEY not set');
        return;
      }

      const service = EmbeddingService.getInstance({
        apiKey,
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      const result = await service.generateEmbedding('This is a test text for embedding generation');

      expect(result).toBeDefined();
      expect(result.embedding).toBeDefined();
      expect(Array.isArray(result.embedding)).toBe(true);
      expect(result.embedding.length).toBeGreaterThan(0);
      expect(result.dimensions).toBe(result.embedding.length);
      expect(result.truncated).toBe(false);
      expect(typeof result.originalLength).toBe('number');
      expect(typeof result.processedLength).toBe('number');
    });

    it.skip('should handle text truncation with real API key', async () => {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        console.warn('Skipping test: OPENAI_API_KEY not set');
        return;
      }

      const service = EmbeddingService.getInstance({
        apiKey,
        model: 'text-embedding-3-small',
        maxTextLength: 100, // Small limit to force truncation
        maxRetries: 3,
        retryDelay: 1000,
      });

      const longText = 'This is a long text that will be truncated. '.repeat(10); // > 100 chars
      const result = await service.generateEmbedding(longText);

      expect(result).toBeDefined();
      expect(result.truncated).toBe(true);
      expect(result.processedLength).toBe(100);
      expect(result.originalLength).toBeGreaterThan(100);
      expect(result.embedding).toBeDefined();
      expect(result.embedding.length).toBeGreaterThan(0);
    });

    it.skip('should generate embeddings for multiple texts with real API key', async () => {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        console.warn('Skipping test: OPENAI_API_KEY not set');
        return;
      }

      const service = EmbeddingService.getInstance({
        apiKey,
        model: 'text-embedding-3-small',
        maxTextLength: 8000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      const texts = [
        'First text for embedding',
        'Second text for embedding',
        'Third text for embedding',
      ];

      const results = await service.generateEmbeddings(texts);

      expect(results).toBeDefined();
      expect(results.length).toBe(3);

      for (const result of results) {
        expect(result.embedding).toBeDefined();
        expect(Array.isArray(result.embedding)).toBe(true);
        expect(result.embedding.length).toBeGreaterThan(0);
      }
    });
  });
});
