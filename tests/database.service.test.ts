/**
 * KURA Notes - Database Service Tests
 *
 * Comprehensive tests for database operations
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { unlink, existsSync } from 'fs';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../src/services/database/database.service.js';
import type { CreateContentInput, ContentType } from '../src/models/index.js';

const unlinkAsync = promisify(unlink);

// Test database path
const TEST_DB_PATH = './test-knowledge.db';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    // Reset singleton and create new instance for each test
    DatabaseService.resetInstance();
    db = DatabaseService.getInstance(TEST_DB_PATH);
  });

  afterEach(async () => {
    // Clean up database file
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
  // Initialization Tests
  // =========================================================================

  describe('Initialization', () => {
    test('should create database file on first run', () => {
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    test('should apply schema correctly', () => {
      const version = db.getSchemaVersion();
      expect(version).not.toBeNull();
      expect(version?.version).toBe(1);
      expect(version?.description).toContain('Initial schema');
    });

    test('should pass health check', () => {
      expect(db.healthCheck()).toBe(true);
    });

    test('should return singleton instance', () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  // =========================================================================
  // CRUD Operations Tests
  // =========================================================================

  describe('Create Content', () => {
    test('should create text content successfully', () => {
      const input: CreateContentInput = {
        id: uuidv4(),
        file_path: '/2025/01/15/test-note.txt',
        content_type: 'text',
        title: 'Test Note',
        source: 'web',
        tags: ['test', 'note'],
        annotation: 'This is a test note',
        extracted_text: 'Content of the test note',
      };

      const created = db.createContent(input);

      expect(created.id).toBe(input.id);
      expect(created.title).toBe(input.title);
      expect(created.content_type).toBe(input.content_type);
      expect(created.tags).toEqual(input.tags);
      expect(created.annotation).toBe(input.annotation);
      expect(created.extracted_text).toBe(input.extracted_text);
      expect(created.created_at).toBeDefined();
      expect(created.updated_at).toBeDefined();
    });

    test('should create content with minimal fields', () => {
      const input: CreateContentInput = {
        id: uuidv4(),
        file_path: '/2025/01/15/minimal.txt',
        content_type: 'text',
      };

      const created = db.createContent(input);

      expect(created.id).toBe(input.id);
      expect(created.title).toBeNull();
      expect(created.tags).toEqual([]);
      expect(created.annotation).toBeNull();
    });

    test('should create different content types', () => {
      const types: ContentType[] = ['text', 'image', 'pdf', 'audio'];

      types.forEach((type) => {
        const input: CreateContentInput = {
          id: uuidv4(),
          file_path: `/2025/01/15/test.${type}`,
          content_type: type,
          title: `Test ${type}`,
        };

        const created = db.createContent(input);
        expect(created.content_type).toBe(type);
      });
    });
  });

  describe('Read Content', () => {
    test('should retrieve content by ID', () => {
      const input: CreateContentInput = {
        id: uuidv4(),
        file_path: '/test.txt',
        content_type: 'text',
        title: 'Findable Note',
      };

      db.createContent(input);
      const found = db.getContentById(input.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(input.id);
      expect(found?.title).toBe(input.title);
    });

    test('should return null for non-existent ID', () => {
      const found = db.getContentById('non-existent-id');
      expect(found).toBeNull();
    });

    test('should get all content with pagination', () => {
      // Create 5 test items
      for (let i = 0; i < 5; i++) {
        db.createContent({
          id: uuidv4(),
          file_path: `/test-${i}.txt`,
          content_type: 'text',
          title: `Note ${i}`,
        });
      }

      const all = db.getAllContent(10, 0);
      expect(all.length).toBe(5);

      // Test pagination
      const page1 = db.getAllContent(2, 0);
      expect(page1.length).toBe(2);

      const page2 = db.getAllContent(2, 2);
      expect(page2.length).toBe(2);
    });

    test('should get recent content', () => {
      // Create content
      for (let i = 0; i < 3; i++) {
        db.createContent({
          id: uuidv4(),
          file_path: `/test-${i}.txt`,
          content_type: 'text',
          title: `Note ${i}`,
        });
      }

      const recent = db.getRecentContent(2);
      expect(recent.length).toBe(2);

      // Should be ordered by created_at DESC (most recent first)
      expect(recent[0].title).toBe('Note 2');
      expect(recent[1].title).toBe('Note 1');
    });
  });

  describe('Update Content', () => {
    test('should update content title', () => {
      const id = uuidv4();
      db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        title: 'Original Title',
      });

      const updated = db.updateContent(id, { title: 'Updated Title' });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('Updated Title');
    });

    test('should update content tags', () => {
      const id = uuidv4();
      db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        tags: ['old', 'tags'],
      });

      const updated = db.updateContent(id, { tags: ['new', 'tags', 'here'] });

      expect(updated?.tags).toEqual(['new', 'tags', 'here']);
    });

    test('should update multiple fields', () => {
      const id = uuidv4();
      db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        title: 'Old',
        annotation: 'Old annotation',
      });

      const updated = db.updateContent(id, {
        title: 'New',
        annotation: 'New annotation',
        tags: ['tag1', 'tag2'],
      });

      expect(updated?.title).toBe('New');
      expect(updated?.annotation).toBe('New annotation');
      expect(updated?.tags).toEqual(['tag1', 'tag2']);
    });

    test('should update updated_at timestamp', () => {
      const id = uuidv4();
      const created = db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
      });

      // Wait a bit to ensure timestamp difference
      const originalUpdatedAt = created.updated_at;

      // Update
      const updated = db.updateContent(id, { title: 'Updated' });

      expect(updated?.updated_at).not.toBe(originalUpdatedAt);
    });
  });

  describe('Delete Content', () => {
    test('should delete content by ID', () => {
      const id = uuidv4();
      db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
      });

      const deleted = db.deleteContent(id);
      expect(deleted).toBe(true);

      // Verify it's gone
      const found = db.getContentById(id);
      expect(found).toBeNull();
    });

    test('should return false when deleting non-existent content', () => {
      const deleted = db.deleteContent('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  // =========================================================================
  // Statistics Tests
  // =========================================================================

  describe('Statistics', () => {
    test('should return correct total count', () => {
      expect(db.getTotalContentCount()).toBe(0);

      db.createContent({
        id: uuidv4(),
        file_path: '/test.txt',
        content_type: 'text',
      });

      expect(db.getTotalContentCount()).toBe(1);
    });

    test('should return count by content type', () => {
      db.createContent({
        id: uuidv4(),
        file_path: '/test.txt',
        content_type: 'text',
      });

      db.createContent({
        id: uuidv4(),
        file_path: '/test.jpg',
        content_type: 'image',
      });

      db.createContent({
        id: uuidv4(),
        file_path: '/test2.txt',
        content_type: 'text',
      });

      const byType = db.getContentCountByType();

      expect(byType['text']).toBe(2);
      expect(byType['image']).toBe(1);
    });

    test('should return database stats', () => {
      const stats = db.getStats();

      expect(stats.totalContent).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.schemaVersion?.version).toBe(1);
      expect(stats.databasePath).toBe(TEST_DB_PATH);
    });
  });

  // =========================================================================
  // Full-Text Search Tests
  // =========================================================================

  describe('Full-Text Search', () => {
    beforeEach(() => {
      // Create test content for searching
      db.createContent({
        id: uuidv4(),
        file_path: '/note1.txt',
        content_type: 'text',
        title: 'TypeScript Programming',
        extracted_text: 'Learning TypeScript is fun and useful',
      });

      db.createContent({
        id: uuidv4(),
        file_path: '/note2.txt',
        content_type: 'text',
        title: 'JavaScript Basics',
        extracted_text: 'JavaScript is the language of the web',
      });

      db.createContent({
        id: uuidv4(),
        file_path: '/note3.txt',
        content_type: 'text',
        title: 'Python Tutorial',
        extracted_text: 'Python is great for data science',
      });
    });

    test('should search content by title', () => {
      const results = db.searchContent('TypeScript');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('TypeScript');
    });

    test('should search content by extracted text', () => {
      const results = db.searchContent('web');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].extracted_text).toContain('web');
    });

    test('should return empty array for non-matching query', () => {
      const results = db.searchContent('nonexistent');
      expect(results.length).toBe(0);
    });

    test('should limit search results', () => {
      const results = db.searchContent('language OR programming OR tutorial', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('should search with content type filter', () => {
      db.createContent({
        id: uuidv4(),
        file_path: '/image.jpg',
        content_type: 'image',
        annotation: 'TypeScript diagram',
      });

      const results = db.searchWithFilters(
        'TypeScript',
        { contentTypes: ['text'] },
        10
      );

      expect(results.every((r) => r.content_type === 'text')).toBe(true);
    });
  });

  // =========================================================================
  // Search History Tests
  // =========================================================================

  describe('Search History', () => {
    test('should save search history', () => {
      db.saveSearchHistory('test query', 5);

      const history = db.getSearchHistory(10);
      expect(history.length).toBe(1);
      expect(history[0].query).toBe('test query');
      expect(history[0].results_count).toBe(5);
    });

    test('should retrieve recent search history', () => {
      db.saveSearchHistory('query 1', 1);
      db.saveSearchHistory('query 2', 2);
      db.saveSearchHistory('query 3', 3);

      const history = db.getSearchHistory(2);
      expect(history.length).toBe(2);

      // Should be ordered by created_at DESC
      expect(history[0].query).toBe('query 3');
      expect(history[1].query).toBe('query 2');
    });
  });

  // =========================================================================
  // Edge Cases & Error Handling
  // =========================================================================

  describe('Edge Cases', () => {
    test('should handle empty tags array', () => {
      const id = uuidv4();
      const created = db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        tags: [],
      });

      expect(created.tags).toEqual([]);
    });

    test('should handle null values correctly', () => {
      const id = uuidv4();
      const created = db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        title: undefined,
        annotation: undefined,
      });

      expect(created.title).toBeNull();
      expect(created.annotation).toBeNull();
    });

    test('should handle special characters in content', () => {
      const id = uuidv4();
      const specialContent = "Content with 'quotes', \"double quotes\", and emoji 🚀";

      const created = db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        extracted_text: specialContent,
      });

      expect(created.extracted_text).toBe(specialContent);

      const found = db.getContentById(id);
      expect(found?.extracted_text).toBe(specialContent);
    });

    test('should handle very long text', () => {
      const id = uuidv4();
      const longText = 'A'.repeat(10000);

      const created = db.createContent({
        id,
        file_path: '/test.txt',
        content_type: 'text',
        extracted_text: longText,
      });

      expect(created.extracted_text?.length).toBe(10000);
    });
  });
});
