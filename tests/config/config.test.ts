/**
 * Tests for configuration service
 */

import { loadConfig, type Config } from '../../src/config/config.js';

describe('Configuration Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    it('should load configuration with default values', () => {
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.nodeEnv).toBeDefined();
      expect(config.apiPort).toBe(3000);
      expect(config.logLevel).toBeDefined();
    });

    it('should use development as default NODE_ENV', () => {
      delete process.env.NODE_ENV;
      const config = loadConfig();

      expect(config.nodeEnv).toBe('development');
    });

    it('should have default API port of 3000', () => {
      delete process.env.API_PORT;
      const config = loadConfig();

      expect(config.apiPort).toBe(3000);
    });
  });

  describe('Environment Variable Loading', () => {
    it('should load NODE_ENV from environment', () => {
      process.env.NODE_ENV = 'test';
      const config = loadConfig();

      expect(config.nodeEnv).toBe('test');
    });

    it('should load API_PORT from environment', () => {
      process.env.API_PORT = '8080';
      const config = loadConfig();

      expect(config.apiPort).toBe(8080);
    });

    it('should load LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      const config = loadConfig();

      expect(config.logLevel).toBe('debug');
    });

    it('should load optional OpenAI API key', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      const config = loadConfig();

      expect(config.openaiApiKey).toBe('sk-test-key');
    });

    it('should handle missing optional values', () => {
      delete process.env.OPENAI_API_KEY;
      const config = loadConfig();

      expect(config.openaiApiKey).toBeUndefined();
    });
  });

  describe('Integer Parsing', () => {
    it('should parse integer from string', () => {
      process.env.API_PORT = '9000';
      const config = loadConfig();

      expect(config.apiPort).toBe(9000);
      expect(typeof config.apiPort).toBe('number');
    });

    it('should parse MAX_FILE_SIZE', () => {
      process.env.MAX_FILE_SIZE = '104857600'; // 100MB
      const config = loadConfig();

      expect(config.maxFileSize).toBe(104857600);
    });

    it('should throw error for invalid integer', () => {
      process.env.API_PORT = 'not-a-number';

      expect(() => loadConfig()).toThrow();
    });
  });

  describe('Path Normalization', () => {
    it('should normalize relative database path', () => {
      process.env.DATABASE_URL = './data/test.db';
      const config = loadConfig();

      expect(config.databaseUrl).toContain('data/test.db');
      // Should be absolute path
      expect(config.databaseUrl.startsWith('/')).toBe(true);
    });

    it('should keep absolute paths unchanged', () => {
      process.env.DATABASE_URL = '/absolute/path/to/db.sqlite';
      const config = loadConfig();

      expect(config.databaseUrl).toBe('/absolute/path/to/db.sqlite');
    });
  });

  describe('Storage Configuration', () => {
    it('should load storage base path', () => {
      process.env.STORAGE_BASE_PATH = './custom/storage';
      const config = loadConfig();

      expect(config.storageBasePath).toBe('./custom/storage');
    });

    it('should have default max file size of 50MB', () => {
      delete process.env.MAX_FILE_SIZE;
      const config = loadConfig();

      expect(config.maxFileSize).toBe(52428800); // 50MB in bytes
    });
  });

  describe('Vector Store Configuration', () => {
    it('should load vector store URL', () => {
      process.env.VECTOR_STORE_URL = 'http://custom:8080';
      const config = loadConfig();

      expect(config.vectorStoreUrl).toBe('http://custom:8080');
    });

    it('should have default vector store URL', () => {
      delete process.env.VECTOR_STORE_URL;
      const config = loadConfig();

      expect(config.vectorStoreUrl).toBe('http://localhost:8000');
    });

    it('should load optional vector DB key', () => {
      process.env.VECTOR_DB_KEY = 'test-vector-key';
      const config = loadConfig();

      expect(config.vectorDbKey).toBe('test-vector-key');
    });
  });

  describe('OpenAI Configuration', () => {
    it('should use default embedding model', () => {
      delete process.env.OPENAI_EMBEDDING_MODEL;
      const config = loadConfig();

      expect(config.openaiEmbeddingModel).toBe('text-embedding-3-small');
    });

    it('should allow custom embedding model', () => {
      process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large';
      const config = loadConfig();

      expect(config.openaiEmbeddingModel).toBe('text-embedding-3-large');
    });
  });

  describe('CORS Configuration', () => {
    it('should have default CORS origin of *', () => {
      delete process.env.CORS_ORIGIN;
      const config = loadConfig();

      expect(config.corsOrigin).toBe('*');
    });

    it('should allow custom CORS origin', () => {
      process.env.CORS_ORIGIN = 'https://example.com';
      const config = loadConfig();

      expect(config.corsOrigin).toBe('https://example.com');
    });
  });

  describe('TLS Configuration', () => {
    it('should handle optional TLS paths', () => {
      delete process.env.TLS_CERT_PATH;
      delete process.env.TLS_KEY_PATH;
      const config = loadConfig();

      expect(config.tlsCertPath).toBeUndefined();
      expect(config.tlsKeyPath).toBeUndefined();
    });

    it('should load TLS paths when provided', () => {
      process.env.TLS_CERT_PATH = '/path/to/cert.pem';
      process.env.TLS_KEY_PATH = '/path/to/key.pem';
      const config = loadConfig();

      expect(config.tlsCertPath).toBe('/path/to/cert.pem');
      expect(config.tlsKeyPath).toBe('/path/to/key.pem');
    });
  });

  describe('Logging Configuration', () => {
    it('should have default log level of info', () => {
      delete process.env.LOG_LEVEL;
      const config = loadConfig();

      expect(config.logLevel).toBe('info');
    });

    it('should support different log levels', () => {
      const levels: Array<Config['logLevel']> = ['error', 'warn', 'info', 'debug'];

      levels.forEach((level) => {
        process.env.LOG_LEVEL = level;
        const config = loadConfig();
        expect(config.logLevel).toBe(level);
      });
    });

    it('should have default log directory', () => {
      delete process.env.LOG_DIR;
      const config = loadConfig();

      expect(config.logDir).toBe('./data/logs');
    });

    it('should allow custom log directory', () => {
      process.env.LOG_DIR = '/var/log/kura-notes';
      const config = loadConfig();

      expect(config.logDir).toBe('/var/log/kura-notes');
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid production configuration', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'a'.repeat(32); // 32 character key
      process.env.CORS_ORIGIN = 'https://example.com';

      expect(() => loadConfig()).not.toThrow();
    });

    it('should warn about weak API key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'short-key';

      // Should throw due to validation
      expect(() => loadConfig()).toThrow(/API_KEY should be at least 32 characters/);
    });

    it('should reject default API key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'dev-api-key-change-in-production';

      expect(() => loadConfig()).toThrow(/API_KEY must be changed from default/);
    });
  });
});
