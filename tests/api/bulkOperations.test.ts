/**
 * KURA Notes - Bulk Operations API Integration Tests
 *
 * Tests for POST /api/content/bulk/delete and POST /api/content/bulk/tag endpoints (Task 3.6)
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';
import { config } from '../../src/config/index.js';
import { DatabaseService } from '../../src/services/database/database.service.js';
import { FileStorageService } from '../../src/services/fileStorage.js';
import { rmSync, existsSync } from 'fs';

// Test database and storage paths
const TEST_DB_PATH = './test-bulk-knowledge.db';
const TEST_STORAGE_PATH = './test-bulk-storage';

describe('Bulk Operations API', () => {
  let server: FastifyInstance;
  let contentIds: string[] = [];

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

    // Create some test content items
    for (let i = 0; i < 5; i++) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/capture',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          content: `Test content ${i}`,
          contentType: 'text',
          metadata: {
            title: `Test ${i}`,
            tags: ['test', `item${i}`],
          },
        },
      });

      const result = JSON.parse(response.payload);
      if (result.id) {
        contentIds.push(result.id);
      }
    }
  });

  afterAll(async () => {
    // Close server
    await server.close();

    // Clean up database
    const db = DatabaseService.getInstance();
    db.close();

    // Clean up test files
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  });

  describe('POST /api/content/bulk/delete', () => {
    test('should delete multiple items successfully', async () => {
      // Delete first 2 items
      const idsToDelete = contentIds.slice(0, 2);

      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/delete',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: idsToDelete,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.results.successful).toHaveLength(2);
      expect(result.results.failed).toHaveLength(0);

      // Verify items are deleted
      const db = DatabaseService.getInstance();
      for (const id of idsToDelete) {
        const content = db.getContentById(id);
        expect(content).toBeNull();
      }
    });

    test('should handle non-existent IDs gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/delete',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: ['non-existent-id-1', 'non-existent-id-2'],
        },
      });

      // Should return 500 for all failures
      expect(response.statusCode).toBe(500);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.results.successful).toHaveLength(0);
      expect(result.results.failed).toHaveLength(2);
    });

    test('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/delete',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          ids: [contentIds[2]],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    test('should validate request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/delete',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          // Missing ids field
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/content/bulk/tag', () => {
    test('should add tags to multiple items successfully', async () => {
      // Use remaining items (indices 2-4)
      const idsToTag = contentIds.slice(2, 5);

      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/tag',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: idsToTag,
          tags: ['bulk-added', 'new-tag'],
          mode: 'add',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.results.successful).toHaveLength(3);
      expect(result.results.failed).toHaveLength(0);

      // Verify tags were added
      const db = DatabaseService.getInstance();
      for (const id of idsToTag) {
        const content = db.getContentById(id);
        expect(content).not.toBeNull();
        expect(content?.tags).toContain('bulk-added');
        expect(content?.tags).toContain('new-tag');
      }
    });

    test('should replace tags when mode is replace', async () => {
      const idToTag = contentIds[3];

      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/tag',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: [idToTag],
          tags: ['replaced-tag'],
          mode: 'replace',
        },
      });

      expect(response.statusCode).toBe(200);

      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // Verify old tags were replaced
      const db = DatabaseService.getInstance();
      const content = db.getContentById(idToTag);
      expect(content).not.toBeNull();
      expect(content?.tags).toEqual(['replaced-tag']);
      expect(content?.tags).not.toContain('test');
    });

    test('should validate tag format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/tag',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: [contentIds[4]],
          tags: ['invalid tag with spaces'], // Invalid tag
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should enforce maximum tag limit', async () => {
      // Create 21 tags (exceeds limit of 20)
      const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);

      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/tag',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: [contentIds[4]],
          tags: tooManyTags,
        },
      });

      // Should return 400 for schema validation failure (Fastify rejects before endpoint logic)
      expect(response.statusCode).toBe(400);

      const result = JSON.parse(response.payload);
      expect(result.error).toBeTruthy();
    });

    test('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/tag',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          ids: [contentIds[4]],
          tags: ['new-tag'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    test('should validate request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/content/bulk/tag',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        payload: {
          ids: [contentIds[4]],
          // Missing tags field
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
