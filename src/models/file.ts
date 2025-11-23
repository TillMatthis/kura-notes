/**
 * File-related type definitions and interfaces
 */

import type { ContentType as DBContentType } from './content.js';

/**
 * Supported content types for file storage (re-export from content model)
 */
export type ContentType = DBContentType;

/**
 * File metadata stored in database
 */
export interface FileMetadata {
  id: string;
  filePath: string;
  contentType: ContentType;
  title?: string;
  annotation?: string;
  tags?: string[];
  extractedText?: string;
  createdAt: Date;
  updatedAt: Date;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Options for saving a file
 */
export interface SaveFileOptions {
  userId: string; // KOauth user ID (required for multi-user support)
  content: Buffer | string;
  contentType: ContentType;
  title?: string;
  annotation?: string;
  tags?: string[];
  originalFilename?: string;
  mimeType?: string;
}

/**
 * Result of file save operation
 */
export interface SaveFileResult {
  success: boolean;
  id?: string;
  filePath?: string;
  error?: string;
}

/**
 * Result of file read operation
 */
export interface ReadFileResult {
  success: boolean;
  content?: Buffer;
  metadata?: FileMetadata;
  error?: string;
}

/**
 * Result of file delete operation
 */
export interface DeleteFileResult {
  success: boolean;
  error?: string;
}

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Supported MIME types
 */
export const SUPPORTED_MIME_TYPES: Record<ContentType, readonly string[]> = {
  text: ['text/plain', 'text/markdown'],
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  pdf: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'], // For future use
};

/**
 * Maximum file sizes (in bytes)
 */
export const MAX_FILE_SIZE: Record<ContentType, number> = {
  text: 10 * 1024 * 1024, // 10MB
  image: 50 * 1024 * 1024, // 50MB
  pdf: 50 * 1024 * 1024, // 50MB
  audio: 100 * 1024 * 1024, // 100MB (for future use)
};
