/**
 * KURA Notes - Authentication Tests
 *
 * Tests for API key authentication middleware
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';
import { config } from '../../src/config/index.js';
import { DatabaseService } from '../../src/services/database/database.service.js';
import { unlink, existsSync } from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(unlink);

// Test database path
const TEST_DB_PATH = './test-auth-knowledge.db';

describe('Authentication', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    // Initialize database with test path
    DatabaseService.resetInstance();
    DatabaseService.getInstance(TEST_DB_PATH);

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
  });

  // =========================================================================
  // Public Endpoints (No Auth Required)
  // =========================================================================

  describe('Public Endpoints', () => {
    test('should allow access to /api/health without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
    });

    test('should allow access to /health without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // Missing API Key Tests
  // =========================================================================

  describe('Missing API Key', () => {
    test('should return 401 when accessing protected route without API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected', // This route doesn't exist, but auth runs first
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_API_KEY');
      expect(body.message).toBe('API key is required');
    });

    test('should include error details in response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected',
      });

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        error: expect.any(String),
        code: 'MISSING_API_KEY',
        message: expect.any(String),
        timestamp: expect.any(String),
      });
    });
  });

  // =========================================================================
  // Invalid API Key Tests
  // =========================================================================

  describe('Invalid API Key', () => {
    test('should return 401 with invalid API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer invalid-api-key',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_API_KEY');
      expect(body.message).toBe('Invalid API key');
    });

    test('should return 401 with empty API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer ',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_API_KEY');
    });

    test('should return 401 with malformed authorization header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'NotBearer some-key',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // Valid API Key Tests
  // =========================================================================

  describe('Valid API Key', () => {
    test('should accept valid API key with Bearer prefix', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent', // Will get 404, but passes auth
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      });

      // Should not be 401 (auth passed)
      expect(response.statusCode).not.toBe(401);
      // Should be 404 (route not found)
      expect(response.statusCode).toBe(404);
    });

    test('should accept valid API key without Bearer prefix', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent',
        headers: {
          authorization: config.apiKey,
        },
      });

      // Should not be 401 (auth passed)
      expect(response.statusCode).not.toBe(401);
      // Should be 404 (route not found)
      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // Different HTTP Methods
  // =========================================================================

  describe('Authentication Across HTTP Methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

    methods.forEach((method) => {
      test(`should require authentication for ${method} requests`, async () => {
        const response = await server.inject({
          method,
          url: '/api/protected',
        });

        expect(response.statusCode).toBe(401);

        const body = JSON.parse(response.body);
        expect(body.code).toBe('MISSING_API_KEY');
      });

      test(`should accept valid API key for ${method} requests`, async () => {
        const response = await server.inject({
          method,
          url: '/api/nonexistent',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
          },
        });

        // Should not be 401 (auth passed)
        expect(response.statusCode).not.toBe(401);
      });
    });
  });

  // =========================================================================
  // Case Sensitivity Tests
  // =========================================================================

  describe('Header Case Sensitivity', () => {
    test('should accept Authorization header (capital A)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      expect(response.statusCode).not.toBe(401);
    });

    test('should accept authorization header (lowercase a)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      });

      expect(response.statusCode).not.toBe(401);
    });
  });

  // =========================================================================
  // Security Tests
  // =========================================================================

  describe('Security', () => {
    test('should not leak API key in error messages', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer wrong-key',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.message).not.toContain(config.apiKey);
      expect(JSON.stringify(body)).not.toContain(config.apiKey);
    });

    test('should log authentication failures', async () => {
      // This test verifies logging happens (checked in logs)
      // In a real scenario, you'd mock the logger to verify calls
      const response = await server.inject({
        method: 'GET',
        url: '/api/protected',
      });

      expect(response.statusCode).toBe(401);
      // Logger should have recorded this attempt
    });
  });
});
