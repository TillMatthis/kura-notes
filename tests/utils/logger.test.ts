/**
 * Tests for logging service
 */

import { logger, createChildLogger } from '../../src/utils/logger.js';

describe('Logger Service', () => {
  beforeEach(() => {
    // Clear any previous mock calls if needed
  });

  describe('Basic Logging', () => {
    it('should create logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it('should log info messages', () => {
      // This test just ensures logging doesn't throw
      expect(() => {
        logger.info('Test info message');
      }).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => {
        logger.error('Test error message', { error: 'test error' });
      }).not.toThrow();
    });

    it('should log warning messages', () => {
      expect(() => {
        logger.warn('Test warning message');
      }).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => {
        logger.debug('Test debug message');
      }).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() => {
        logger.info('Test with metadata', {
          userId: 'test-user',
          action: 'test-action',
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with metadata', () => {
      const childLogger = createChildLogger({ service: 'test-service' });
      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeDefined();
    });

    it('should log with child logger', () => {
      const childLogger = createChildLogger({ service: 'test-service' });
      expect(() => {
        childLogger.info('Child logger test message');
      }).not.toThrow();
    });
  });

  describe('Sensitive Data Filtering', () => {
    it('should not throw when logging objects with sensitive keys', () => {
      expect(() => {
        logger.info('Logging with sensitive data', {
          userId: 'user-123',
          apiKey: 'sk-1234567890abcdef',
          password: 'supersecret',
          token: 'bearer-token-xyz',
        });
      }).not.toThrow();
    });

    it('should handle nested objects with sensitive data', () => {
      expect(() => {
        logger.info('Nested sensitive data', {
          user: {
            id: 'user-123',
            apiKey: 'sk-1234567890abcdef',
            profile: {
              name: 'Test User',
              secret: 'should-be-masked',
            },
          },
        });
      }).not.toThrow();
    });

    it('should handle arrays with sensitive data', () => {
      expect(() => {
        logger.info('Array with sensitive data', {
          items: [
            { id: '1', apiKey: 'key-1' },
            { id: '2', password: 'pass-2' },
          ],
        });
      }).not.toThrow();
    });
  });

  describe('Error Logging', () => {
    it('should log Error objects', () => {
      const error = new Error('Test error message');
      expect(() => {
        logger.error('An error occurred', {
          error: error.message,
          stack: error.stack,
        });
      }).not.toThrow();
    });

    it('should log with stack traces', () => {
      try {
        throw new Error('Test error with stack');
      } catch (error) {
        expect(() => {
          logger.error('Caught error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });
        }).not.toThrow();
      }
    });
  });

  describe('Service Helper Functions', () => {
    it('should support structured logging patterns', () => {
      expect(() => {
        logger.info('Service initialized', {
          service: 'TestService',
          version: '1.0.0',
          config: {
            enabled: true,
            timeout: 5000,
          },
        });
      }).not.toThrow();
    });

    it('should handle null and undefined values', () => {
      expect(() => {
        logger.info('Test with null/undefined', {
          nullValue: null,
          undefinedValue: undefined,
          normalValue: 'test',
        });
      }).not.toThrow();
    });

    it('should handle complex nested structures', () => {
      expect(() => {
        logger.info('Complex structure', {
          database: {
            connection: {
              host: 'localhost',
              port: 5432,
              credentials: {
                username: 'user',
                password: 'should-be-masked',
              },
            },
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
          },
        });
      }).not.toThrow();
    });
  });
});
