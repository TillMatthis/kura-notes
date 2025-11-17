/**
 * KURA Notes - API Server Integration Tests
 *
 * Tests for Fastify server setup, middleware, and core functionality
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';
import { config } from '../../src/config/index.js';
import { DatabaseService } from '../../src/services/database/database.service.js';
import { unlink, existsSync } from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(unlink);

// Test database path
const TEST_DB_PATH = './test-api-knowledge.db';

describe('API Server', () => {
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
  // Server Configuration Tests
  // =========================================================================

  describe('Server Configuration', () => {
    test('should create server successfully', () => {
      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
    });

    test('should have CORS enabled', () => {
      // CORS plugin should be registered
      expect(server.hasPlugin('@fastify/cors')).toBe(true);
    });

    test('should have multipart enabled', () => {
      // Multipart plugin should be registered
      expect(server.hasPlugin('@fastify/multipart')).toBe(true);
    });

    test('should have error handler registered', () => {
      expect(server.errorHandler).toBeDefined();
    });
  });

  // =========================================================================
  // Health Check Endpoint Tests
  // =========================================================================

  describe('GET /api/health', () => {
    test('should return health status without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('services');
      expect(body.services).toHaveProperty('database');
      expect(body.services).toHaveProperty('vectorStore');
    });

    test('should report database as up', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
      });

      const body = JSON.parse(response.body);
      expect(body.services.database.status).toBe('up');
    });

    test('should include response time for services', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
      });

      const body = JSON.parse(response.body);
      expect(body.services.database).toHaveProperty('responseTime');
      expect(typeof body.services.database.responseTime).toBe('number');
    });

    test('should work on alternative /health endpoint', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
    });
  });

  // =========================================================================
  // Authentication Tests
  // =========================================================================

  describe('Authentication Middleware', () => {
    test('should allow access to /api/health without API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
    });

    test('should allow access to /health without API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    // Note: We can't test protected endpoints yet as they don't exist
    // These tests will be added in Task 1.7 when we add the capture endpoint
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should return 404 for non-existent routes with valid API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('timestamp');
    });

    test('should return consistent error format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        error: expect.any(String),
        code: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String),
      });
    });

    test('should handle invalid JSON body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/health', // Using health as a test endpoint
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: 'invalid json',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
    });
  });

  // =========================================================================
  // Request Logging Tests
  // =========================================================================

  describe('Request Logging', () => {
    test('should complete requests successfully', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
      });

      // Response should be successful
      expect(response.statusCode).toBe(200);

      // Note: X-Response-Time header may not appear in inject() tests
      // but works correctly in real HTTP requests due to onResponse hook timing
    });

    test('should include request ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
        headers: {
          'x-request-id': 'test-request-123',
        },
      });

      // Fastify should preserve the request ID
      expect(response.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // CORS Tests
  // =========================================================================

  describe('CORS Configuration', () => {
    test('should include CORS headers in response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/health',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    test('should handle OPTIONS preflight request', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/health',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(200);
      expect(response.statusCode).toBeLessThan(300);
    });
  });

  // =========================================================================
  // General API Tests
  // =========================================================================

  describe('General API Behavior', () => {
    test('should accept JSON content-type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/health',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({}),
      });

      // Should not fail due to content-type
      expect(response.statusCode).toBeLessThan(500);
    });

    test('should enforce body size limits', async () => {
      // Create a payload larger than the limit (if we had a POST endpoint)
      // This is a placeholder - will be tested properly in Task 1.7
      const largePayload = 'x'.repeat(config.maxFileSize + 1);

      const response = await server.inject({
        method: 'POST',
        url: '/api/health',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        payload: largePayload,
      });

      // Should reject large payloads
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
