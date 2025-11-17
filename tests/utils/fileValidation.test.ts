/**
 * File Validation Utilities Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateFileType,
  validateFileSize,
  validateFile,
  inferMimeType,
  getContentTypeFromMime,
} from '../../src/utils/fileValidation.js';

describe('File Validation Utilities', () => {
  describe('validateFileType', () => {
    it('should accept valid text MIME types', () => {
      const result1 = validateFileType('text', 'text/plain');
      expect(result1.valid).toBe(true);

      const result2 = validateFileType('text', 'text/markdown');
      expect(result2.valid).toBe(true);
    });

    it('should accept valid image MIME types', () => {
      const result1 = validateFileType('image', 'image/jpeg');
      expect(result1.valid).toBe(true);

      const result2 = validateFileType('image', 'image/png');
      expect(result2.valid).toBe(true);

      const result3 = validateFileType('image', 'image/gif');
      expect(result3.valid).toBe(true);
    });

    it('should accept valid PDF MIME type', () => {
      const result = validateFileType('pdf', 'application/pdf');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid MIME type for content type', () => {
      const result = validateFileType('text', 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
    });

    it('should reject completely unsupported MIME type', () => {
      const result = validateFileType('text', 'video/mp4');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
    });
  });

  describe('validateFileSize', () => {
    it('should accept text files within limit (10MB)', () => {
      const result = validateFileSize('text', 5 * 1024 * 1024); // 5MB
      expect(result.valid).toBe(true);
    });

    it('should accept image files within limit (50MB)', () => {
      const result = validateFileSize('image', 25 * 1024 * 1024); // 25MB
      expect(result.valid).toBe(true);
    });

    it('should accept PDF files within limit (50MB)', () => {
      const result = validateFileSize('pdf', 40 * 1024 * 1024); // 40MB
      expect(result.valid).toBe(true);
    });

    it('should reject text files exceeding limit', () => {
      const result = validateFileSize('text', 15 * 1024 * 1024); // 15MB
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
      expect(result.error).toContain('10.0MB');
    });

    it('should reject image files exceeding limit', () => {
      const result = validateFileSize('image', 60 * 1024 * 1024); // 60MB
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
      expect(result.error).toContain('50.0MB');
    });

    it('should reject empty files (0 bytes)', () => {
      const result = validateFileSize('text', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should accept 1 byte file', () => {
      const result = validateFileSize('text', 1);
      expect(result.valid).toBe(true);
    });

    it('should accept file at exact size limit', () => {
      const result = validateFileSize('text', 10 * 1024 * 1024); // Exactly 10MB
      expect(result.valid).toBe(true);
    });
  });

  describe('validateFile', () => {
    it('should accept valid file (type and size)', () => {
      const result = validateFile('text', 'text/plain', 1024);
      expect(result.valid).toBe(true);
    });

    it('should reject file with invalid type', () => {
      const result = validateFile('text', 'image/jpeg', 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
    });

    it('should reject file with invalid size', () => {
      const result = validateFile('text', 'text/plain', 15 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject empty file even with valid type', () => {
      const result = validateFile('text', 'text/plain', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });
  });

  describe('inferMimeType', () => {
    it('should infer MIME type from .txt extension', () => {
      expect(inferMimeType('document.txt')).toBe('text/plain');
      expect(inferMimeType('README.TXT')).toBe('text/plain');
    });

    it('should infer MIME type from .md extension', () => {
      expect(inferMimeType('notes.md')).toBe('text/markdown');
      expect(inferMimeType('README.MD')).toBe('text/markdown');
    });

    it('should infer MIME type from image extensions', () => {
      expect(inferMimeType('photo.jpg')).toBe('image/jpeg');
      expect(inferMimeType('photo.jpeg')).toBe('image/jpeg');
      expect(inferMimeType('image.png')).toBe('image/png');
      expect(inferMimeType('animation.gif')).toBe('image/gif');
      expect(inferMimeType('picture.webp')).toBe('image/webp');
    });

    it('should infer MIME type from .pdf extension', () => {
      expect(inferMimeType('document.pdf')).toBe('application/pdf');
      expect(inferMimeType('report.PDF')).toBe('application/pdf');
    });

    it('should handle filenames with multiple dots', () => {
      expect(inferMimeType('my.file.name.txt')).toBe('text/plain');
      expect(inferMimeType('report.2023.pdf')).toBe('application/pdf');
    });

    it('should return undefined for unknown extensions', () => {
      expect(inferMimeType('file.xyz')).toBeUndefined();
      expect(inferMimeType('video.mp4')).toBeUndefined();
    });

    it('should return undefined for files without extension', () => {
      expect(inferMimeType('README')).toBeUndefined();
      expect(inferMimeType('file')).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      expect(inferMimeType('FILE.JPG')).toBe('image/jpeg');
      expect(inferMimeType('File.Png')).toBe('image/png');
    });
  });

  describe('getContentTypeFromMime', () => {
    it('should return "text" for text MIME types', () => {
      expect(getContentTypeFromMime('text/plain')).toBe('text');
      expect(getContentTypeFromMime('text/markdown')).toBe('text');
    });

    it('should return "image" for image MIME types', () => {
      expect(getContentTypeFromMime('image/jpeg')).toBe('image');
      expect(getContentTypeFromMime('image/png')).toBe('image');
      expect(getContentTypeFromMime('image/gif')).toBe('image');
      expect(getContentTypeFromMime('image/webp')).toBe('image');
    });

    it('should return "pdf" for PDF MIME type', () => {
      expect(getContentTypeFromMime('application/pdf')).toBe('pdf');
    });

    it('should return "audio" for audio MIME types', () => {
      expect(getContentTypeFromMime('audio/mpeg')).toBe('audio');
      expect(getContentTypeFromMime('audio/mp4')).toBe('audio');
      expect(getContentTypeFromMime('audio/wav')).toBe('audio');
    });

    it('should return undefined for unsupported MIME types', () => {
      expect(getContentTypeFromMime('video/mp4')).toBeUndefined();
      expect(getContentTypeFromMime('application/json')).toBeUndefined();
      expect(getContentTypeFromMime('application/xml')).toBeUndefined();
    });
  });
});
