/**
 * File Storage Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FileStorageService } from '../../src/services/fileStorage.js';
import { DatabaseService } from '../../src/services/database/database.service.js';
import { ContentType } from '../../src/models/file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('FileStorageService', () => {
  let fileStorage: FileStorageService;
  let db: DatabaseService;
  const testBaseDir = path.join(__dirname, '../../test-data');
  const testDbPath = path.join(__dirname, '../../test-data/test-storage.db');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testBaseDir, { recursive: true });

    // Reset database instance
    DatabaseService.resetInstance();

    // Create database and file storage instances
    db = DatabaseService.getInstance(testDbPath);
    fileStorage = new FileStorageService({ baseDirectory: testBaseDir }, db);
  });

  afterEach(() => {
    // Clean up
    db.close();
    DatabaseService.resetInstance();
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  describe('saveFile', () => {
    it('should save a text file with date-based directory structure', async () => {
      const result = await fileStorage.saveFile({
        content: 'Hello, World!',
        contentType: 'text',
        title: 'Test Note',
        tags: ['test', 'hello'],
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.filePath).toBeDefined();

      // Check file exists
      const fullPath = path.join(testBaseDir, result.filePath!);
      expect(fs.existsSync(fullPath)).toBe(true);

      // Check content
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toBe('Hello, World!');

      // Check database entry
      const metadata = db.getContentById(result.id!);
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBe('Test Note');
      expect(metadata?.tags).toEqual(['test', 'hello']);
    });

    it('should save a binary file (image)', async () => {
      const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG header

      const result = await fileStorage.saveFile({
        content: imageBuffer,
        contentType: 'image',
        mimeType: 'image/jpeg',
        originalFilename: 'photo.jpg',
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();

      // Check file exists
      const fullPath = path.join(testBaseDir, result.filePath!);
      expect(fs.existsSync(fullPath)).toBe(true);

      // Check content
      const content = fs.readFileSync(fullPath);
      expect(content).toEqual(imageBuffer);
    });

    it('should reject file that exceeds size limit', async () => {
      // Create content larger than text file limit (10MB)
      const largeContent = Buffer.alloc(11 * 1024 * 1024, 'a');

      const result = await fileStorage.saveFile({
        content: largeContent,
        contentType: 'text',
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject unsupported MIME type', async () => {
      const result = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
        mimeType: 'application/json', // Not supported for text
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
    });

    it('should extract text for text files', async () => {
      const result = await fileStorage.saveFile({
        content: 'This is extracted text',
        contentType: 'text',
        title: 'Test',
      });

      expect(result.success).toBe(true);

      const metadata = db.getContentById(result.id!);
      expect(metadata?.extracted_text).toBe('This is extracted text');
    });

    it('should organize files in YYYY/MM/DD directory structure', async () => {
      const result = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
      });

      expect(result.success).toBe(true);

      // Check path follows YYYY/MM/DD pattern
      const pathParts = result.filePath!.split(path.sep);
      expect(pathParts.length).toBe(4); // year/month/day/filename
      expect(pathParts[0]).toMatch(/^\d{4}$/); // year
      expect(pathParts[1]).toMatch(/^\d{2}$/); // month
      expect(pathParts[2]).toMatch(/^\d{2}$/); // day
    });

    it('should clean up file if database insert fails', async () => {
      // Close the database to cause an error
      db.close();

      const result = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
      });

      expect(result.success).toBe(false);

      // File should not exist since db insert failed
      if (result.filePath) {
        const fullPath = path.join(testBaseDir, result.filePath);
        expect(fs.existsSync(fullPath)).toBe(false);
      }
    });
  });

  describe('readFile', () => {
    it('should read a text file', async () => {
      // Save a file first
      const saveResult = await fileStorage.saveFile({
        content: 'Test content',
        contentType: 'text',
        title: 'Read Test',
      });

      expect(saveResult.success).toBe(true);

      // Read the file
      const readResult = await fileStorage.readFile(saveResult.id!);

      expect(readResult.success).toBe(true);
      expect(readResult.content?.toString()).toBe('Test content');
      expect(readResult.metadata?.title).toBe('Read Test');
    });

    it('should read a binary file', async () => {
      const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

      const saveResult = await fileStorage.saveFile({
        content: imageBuffer,
        contentType: 'image',
        mimeType: 'image/jpeg',
      });

      const readResult = await fileStorage.readFile(saveResult.id!);

      expect(readResult.success).toBe(true);
      expect(readResult.content).toEqual(imageBuffer);
    });

    it('should return error for non-existent file', async () => {
      const readResult = await fileStorage.readFile('non-existent-id');

      expect(readResult.success).toBe(false);
      expect(readResult.error).toContain('not found');
    });

    it('should return error if file exists in DB but not on disk', async () => {
      // Save a file
      const saveResult = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
      });

      // Delete the physical file
      const fullPath = path.join(testBaseDir, saveResult.filePath!);
      fs.unlinkSync(fullPath);

      // Try to read
      const readResult = await fileStorage.readFile(saveResult.id!);

      expect(readResult.success).toBe(false);
      expect(readResult.error).toContain('not found on disk');
    });
  });

  describe('createReadStream', () => {
    it('should create a read stream for a file', async () => {
      // Save a file
      const saveResult = await fileStorage.saveFile({
        content: 'Stream test content',
        contentType: 'text',
      });

      // Create read stream
      const streamResult = fileStorage.createReadStream(saveResult.id!);

      expect(streamResult.success).toBe(true);
      expect(streamResult.stream).toBeDefined();
      expect(streamResult.metadata).toBeDefined();

      // Read from stream
      const chunks: Buffer[] = [];
      streamResult.stream!.on('data', (chunk) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        streamResult.stream!.on('end', () => resolve());
        streamResult.stream!.on('error', reject);
      });

      const content = Buffer.concat(chunks).toString();
      expect(content).toBe('Stream test content');
    });

    it('should return error for non-existent file', () => {
      const streamResult = fileStorage.createReadStream('non-existent-id');

      expect(streamResult.success).toBe(false);
      expect(streamResult.error).toContain('not found');
    });
  });

  describe('deleteFile', () => {
    it('should delete file and metadata', async () => {
      // Save a file
      const saveResult = await fileStorage.saveFile({
        content: 'Delete test',
        contentType: 'text',
      });

      const fullPath = path.join(testBaseDir, saveResult.filePath!);
      expect(fs.existsSync(fullPath)).toBe(true);

      // Delete the file
      const deleteResult = await fileStorage.deleteFile(saveResult.id!);

      expect(deleteResult.success).toBe(true);

      // Check file is gone
      expect(fs.existsSync(fullPath)).toBe(false);

      // Check metadata is gone
      const metadata = db.getContentById(saveResult.id!);
      expect(metadata).toBeNull();
    });

    it('should succeed even if file is missing from disk', async () => {
      // Save a file
      const saveResult = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
      });

      // Delete physical file manually
      const fullPath = path.join(testBaseDir, saveResult.filePath!);
      fs.unlinkSync(fullPath);

      // Delete should still succeed
      const deleteResult = await fileStorage.deleteFile(saveResult.id!);

      expect(deleteResult.success).toBe(true);

      // Metadata should be gone
      const metadata = db.getContentById(saveResult.id!);
      expect(metadata).toBeNull();
    });

    it('should return error for non-existent content', async () => {
      const deleteResult = await fileStorage.deleteFile('non-existent-id');

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain('not found');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const saveResult = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
      });

      const exists = fileStorage.fileExists(saveResult.id!);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', () => {
      const exists = fileStorage.fileExists('non-existent-id');
      expect(exists).toBe(false);
    });

    it('should return false if file exists in DB but not on disk', async () => {
      const saveResult = await fileStorage.saveFile({
        content: 'test',
        contentType: 'text',
      });

      // Delete physical file
      const fullPath = path.join(testBaseDir, saveResult.filePath!);
      fs.unlinkSync(fullPath);

      const exists = fileStorage.fileExists(saveResult.id!);
      expect(exists).toBe(false);
    });
  });

  describe('getFileMetadata', () => {
    it('should return metadata without reading file content', async () => {
      const saveResult = await fileStorage.saveFile({
        content: 'test content',
        contentType: 'text',
        title: 'Metadata Test',
        tags: ['meta', 'test'],
      });

      const metadata = fileStorage.getFileMetadata(saveResult.id!);

      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe(saveResult.id);
      expect(metadata?.title).toBe('Metadata Test');
      expect(metadata?.tags).toEqual(['meta', 'test']);
      expect(metadata?.contentType).toBe('text');
    });

    it('should return null for non-existent content', () => {
      const metadata = fileStorage.getFileMetadata('non-existent-id');
      expect(metadata).toBeNull();
    });
  });
});
