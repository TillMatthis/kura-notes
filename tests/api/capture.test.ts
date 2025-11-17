/**
 * KURA Notes - Content Capture API Integration Tests
 *
 * Tests for POST /api/capture endpoint (Task 1.7)
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';
import { config } from '../../src/config/index.js';
import { DatabaseService } from '../../src/services/database/database.service.js';
import { FileStorageService } from '../../src/services/fileStorage.js';
import { unlink, existsSync } from 'fs';
import { promisify } from 'util';
import { rmSync } from 'fs';

const unlinkAsync = promisify(unlink);

// Test database and storage paths
const TEST_DB_PATH = './test-capture-knowledge.db';
const TEST_STORAGE_PATH = './test-capture-storage';

describe('POST /api/capture - Text Content', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    // Reset and initialize database
    DatabaseService.resetInstance();
    DatabaseService.getInstance(TEST_DB_PATH);

    // Reset and initialize file storage
    FileStorageService.resetInstance();
    FileStorageService.getInstance(
      {
        baseDirectory: TEST_STORAGE_PATH,
      },
      DatabaseService.getInstance()
    );

    // Create server instance
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    // Close server
    await server.close();

    // Clean up database
    const db = DatabaseService.getInstance();
    db.close();
    DatabaseService.resetInstance();

    if (existsSync(TEST_DB_PATH)) {
      await unlinkAsync(TEST_DB_PATH);
    }

    // Clean up WAL files
    const walFiles = [TEST_DB_PATH + '-wal', TEST_DB_PATH + '-shm'];
    for (const file of walFiles) {
      if (existsSync(file)) {
        await unlinkAsync(file);
      }
    }

    // Clean up storage directory
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }

    // Reset file storage
    FileStorageService.resetInstance();
  });

  // =========================================================================
  // Successful Capture Tests
  // =========================================================================

  describe('Successful Content Capture', () => {
    test('should capture text content with all fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'This is a test note with all fields',
          title: 'Test Note',
          annotation: 'This is an annotation',
          tags: ['test', 'api', 'integration'],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: true,
        id: expect.any(String),
        message: 'Content captured successfully',
        timestamp: expect.any(String),
      });

      // Validate UUID format
      expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      // Verify content was saved to database
      const db = DatabaseService.getInstance();
      const content = db.getContentById(body.id);
      expect(content).toBeDefined();
      expect(content?.title).toBe('Test Note');
      expect(content?.annotation).toBe('This is an annotation');
      expect(content?.tags).toEqual(['test', 'api', 'integration']);
      expect(content?.content_type).toBe('text');
    });

    test('should capture text content with minimal fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Minimal content test',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();

      // Verify content was saved
      const db = DatabaseService.getInstance();
      const content = db.getContentById(body.id);
      expect(content).toBeDefined();
      expect(content?.title).toBeNull();
      expect(content?.annotation).toBeNull();
      expect(content?.tags).toEqual([]);
    });

    test('should capture content with some optional fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Content with title only',
          title: 'Only Title',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      const db = DatabaseService.getInstance();
      const content = db.getContentById(body.id);
      expect(content?.title).toBe('Only Title');
      expect(content?.annotation).toBeNull();
    });

    test('should store extracted text for text content', async () => {
      const testContent = 'This content should be extracted';
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: testContent,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      const db = DatabaseService.getInstance();
      const content = db.getContentById(body.id);
      expect(content?.extracted_text).toBe(testContent);
    });
  });

  // =========================================================================
  // Validation Error Tests
  // =========================================================================

  describe('Validation Errors', () => {
    test('should reject request without content field', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          title: 'No content',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
    });

    test('should reject empty content', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: '',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    test('should reject whitespace-only content', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: '   \n\t  ',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.message).toContain('Content cannot be empty');
    });

    test('should reject invalid tag format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test content',
          tags: ['valid-tag', 'invalid tag with spaces', 'another@invalid'],
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    test('should reject tags with special characters', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test content',
          tags: ['tag#1', 'tag@2'],
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    test('should accept valid tags with dashes and underscores', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test content',
          tags: ['valid-tag', 'another_valid_tag', 'tag123'],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    test('should reject excessively long content', async () => {
      const longContent = 'x'.repeat(1000001); // Over 1MB

      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: longContent,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should reject too many tags', async () => {
      const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);

      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test content',
          tags: manyTags,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should reject invalid JSON', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: 'invalid json',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // Authentication Tests
  // =========================================================================

  describe('Authentication', () => {
    test('should require API key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          content: 'Test without auth',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.code).toBe('MISSING_API_KEY');
    });

    test('should reject invalid API key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer invalid-key',
        },
        payload: {
          content: 'Test with invalid key',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_API_KEY');
    });

    test('should accept valid API key with Bearer prefix', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test with Bearer',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    test('should accept valid API key without Bearer prefix', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: config.apiKey,
        },
        payload: {
          content: 'Test without Bearer',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should return consistent error format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: '',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        error: expect.any(String),
        code: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String),
      });
    });

    test('should handle unexpected errors gracefully', async () => {
      // Try to trigger an error by providing extremely large title
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test',
          title: 'x'.repeat(600), // Over max length
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
    });
  });

  // =========================================================================
  // Response Format Tests
  // =========================================================================

  describe('Response Format', () => {
    test('should include all required response fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test response format',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('timestamp');
    });

    test('should return valid ISO 8601 timestamp', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test timestamp',
        },
      });

      const body = JSON.parse(response.body);
      const timestamp = new Date(body.timestamp);
      expect(timestamp.toISOString()).toBe(body.timestamp);
    });

    test('should have correct content-type header', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: 'Test content-type',
        },
      });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
