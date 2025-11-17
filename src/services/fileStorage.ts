/**
 * File Storage Service
 * Handles file operations with date-based directory structure and UUID filenames
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream } from 'fs';
import winston from 'winston';
import {
  ContentType,
  SaveFileOptions,
  SaveFileResult,
  ReadFileResult,
  DeleteFileResult,
  FileMetadata,
} from '../models/file.js';
import { validateFile, inferMimeType } from '../utils/fileValidation.js';
import { DatabaseService } from './database/database.service.js';
import type { CreateContentInput } from '../models/content.js';

/**
 * File storage service configuration
 */
interface FileStorageConfig {
  baseDirectory: string;
  logger?: winston.Logger;
}

/**
 * File Storage Service
 */
export class FileStorageService {
  private baseDirectory: string;
  private logger: winston.Logger;
  private db: DatabaseService;

  constructor(config: FileStorageConfig, db: DatabaseService) {
    this.baseDirectory = config.baseDirectory;
    this.db = db;

    // Setup logger
    this.logger =
      config.logger ||
      winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        transports: [new winston.transports.Console()],
      });

    // Ensure base directory exists
    this.ensureDirectoryExists(this.baseDirectory);
  }

  /**
   * Generate date-based path (/YYYY/MM/DD/)
   */
  private generateDateBasedPath(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return path.join(String(year), month, day);
  }

  /**
   * Generate UUID-based filename with extension
   */
  private generateFilename(contentType: ContentType, mimeType?: string): string {
    const uuid = uuidv4();
    const extension = this.getExtensionFromMimeType(contentType, mimeType);
    return `${uuid}${extension}`;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(
    contentType: ContentType,
    mimeType?: string
  ): string {
    if (!mimeType) {
      return contentType === 'text' ? '.txt' : '';
    }

    const extensionMap: Record<string, string> = {
      'text/plain': '.txt',
      'text/markdown': '.md',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };

    return extensionMap[mimeType] || '';
  }

  /**
   * Ensure a directory exists, create if it doesn't
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      this.logger.info('Created directory', { path: dirPath });
    }
  }

  /**
   * Get full file path
   */
  private getFullPath(relativePath: string): string {
    return path.join(this.baseDirectory, relativePath);
  }

  /**
   * Save file to storage
   */
  async saveFile(options: SaveFileOptions): Promise<SaveFileResult> {
    try {
      const {
        content,
        contentType,
        title,
        annotation,
        tags,
        originalFilename,
        mimeType: providedMimeType,
      } = options;

      // Generate unique ID
      const id = uuidv4();

      // Determine MIME type
      let mimeType = providedMimeType;
      if (!mimeType && originalFilename) {
        mimeType = inferMimeType(originalFilename);
      }
      if (!mimeType) {
        mimeType = contentType === 'text' ? 'text/plain' : undefined;
      }

      // Get content as buffer
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

      // Validate file
      if (mimeType) {
        const validation = validateFile(contentType, mimeType, buffer.length);
        if (!validation.valid) {
          this.logger.warn('File validation failed', {
            error: validation.error,
            contentType,
            mimeType,
            size: buffer.length,
          });
          return {
            success: false,
            error: validation.error,
          };
        }
      }

      // Generate paths
      const dateBasedPath = this.generateDateBasedPath();
      const filename = this.generateFilename(contentType, mimeType);
      const relativePath = path.join(dateBasedPath, filename);
      const fullPath = this.getFullPath(relativePath);

      // Ensure directory exists
      this.ensureDirectoryExists(path.dirname(fullPath));

      // Write file
      await fsPromises.writeFile(fullPath, buffer);

      this.logger.info('File saved successfully', {
        id,
        path: relativePath,
        size: buffer.length,
        contentType,
      });

      // Save metadata to database using existing Content interface
      const dbInput: CreateContentInput = {
        id,
        file_path: relativePath,
        content_type: contentType,
        title,
        annotation,
        tags,
        extracted_text: contentType === 'text' ? content.toString() : undefined,
        source: 'api', // Default source
      };

      try {
        this.db.createContent(dbInput);
      } catch (dbError) {
        // Clean up file if database insert fails
        await fsPromises.unlink(fullPath).catch((err) => {
          this.logger.error('Failed to clean up file after DB error', {
            error: err,
            path: fullPath,
          });
        });
        throw dbError;
      }

      return {
        success: true,
        id,
        filePath: relativePath,
      };
    } catch (error) {
      this.logger.error('Error saving file', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Read file from storage
   */
  async readFile(id: string): Promise<ReadFileResult> {
    try {
      // Get metadata from database
      const contentRecord = this.db.getContentById(id);
      if (!contentRecord) {
        return {
          success: false,
          error: 'Content not found',
        };
      }

      const fullPath = this.getFullPath(contentRecord.file_path);

      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        this.logger.error('File not found on disk', { id, path: fullPath });
        return {
          success: false,
          error: 'File not found on disk',
        };
      }

      // Read file
      const content = await fsPromises.readFile(fullPath);

      this.logger.info('File read successfully', {
        id,
        path: contentRecord.file_path,
        size: content.length,
      });

      // Map to FileMetadata interface
      const metadata: FileMetadata = {
        id: contentRecord.id,
        filePath: contentRecord.file_path,
        contentType: contentRecord.content_type as ContentType,
        title: contentRecord.title || undefined,
        annotation: contentRecord.annotation || undefined,
        tags: contentRecord.tags,
        extractedText: contentRecord.extracted_text || undefined,
        createdAt: new Date(contentRecord.created_at),
        updatedAt: new Date(contentRecord.updated_at),
      };

      return {
        success: true,
        content,
        metadata,
      };
    } catch (error) {
      this.logger.error('Error reading file', { error, id });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stream file (for large files)
   * Note: Database operation is synchronous (better-sqlite3), so this is safe
   */
  createReadStream(id: string): {
    success: boolean;
    stream?: fs.ReadStream;
    metadata?: FileMetadata;
    error?: string;
  } {
    try {
      // Get metadata from database (better-sqlite3 is synchronous)
      const contentRecord = this.db.getContentById(id);
      if (!contentRecord) {
        return {
          success: false,
          error: 'Content not found',
        };
      }

      const fullPath = this.getFullPath(contentRecord.file_path);

      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        this.logger.error('File not found on disk', { id, path: fullPath });
        return {
          success: false,
          error: 'File not found on disk',
        };
      }

      // Create read stream
      const stream = createReadStream(fullPath);

      this.logger.info('Created read stream', { id, path: contentRecord.file_path });

      // Map to FileMetadata interface
      const metadata: FileMetadata = {
        id: contentRecord.id,
        filePath: contentRecord.file_path,
        contentType: contentRecord.content_type as ContentType,
        title: contentRecord.title || undefined,
        annotation: contentRecord.annotation || undefined,
        tags: contentRecord.tags,
        extractedText: contentRecord.extracted_text || undefined,
        createdAt: new Date(contentRecord.created_at),
        updatedAt: new Date(contentRecord.updated_at),
      };

      return {
        success: true,
        stream,
        metadata,
      };
    } catch (error) {
      this.logger.error('Error creating read stream', { error, id });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(id: string): Promise<DeleteFileResult> {
    try {
      // Get metadata from database
      const contentRecord = this.db.getContentById(id);
      if (!contentRecord) {
        return {
          success: false,
          error: 'Content not found',
        };
      }

      const fullPath = this.getFullPath(contentRecord.file_path);

      // Delete file from disk (continue even if file doesn't exist)
      if (fs.existsSync(fullPath)) {
        await fsPromises.unlink(fullPath);
        this.logger.info('File deleted from disk', {
          id,
          path: contentRecord.file_path,
        });
      } else {
        this.logger.warn('File not found on disk during delete', {
          id,
          path: fullPath,
        });
      }

      // Delete metadata from database
      const deleted = this.db.deleteContent(id);
      if (!deleted) {
        return {
          success: false,
          error: 'Failed to delete content from database',
        };
      }

      this.logger.info('File and metadata deleted successfully', { id });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('Error deleting file', { error, id });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if file exists
   */
  fileExists(id: string): boolean {
    try {
      const contentRecord = this.db.getContentById(id);
      if (!contentRecord) {
        return false;
      }

      const fullPath = this.getFullPath(contentRecord.file_path);
      return fs.existsSync(fullPath);
    } catch (error) {
      this.logger.error('Error checking file existence', { error, id });
      return false;
    }
  }

  /**
   * Get file metadata only (without reading file content)
   */
  getFileMetadata(id: string): FileMetadata | null {
    try {
      const contentRecord = this.db.getContentById(id);
      if (!contentRecord) {
        return null;
      }

      // Map to FileMetadata interface
      const metadata: FileMetadata = {
        id: contentRecord.id,
        filePath: contentRecord.file_path,
        contentType: contentRecord.content_type as ContentType,
        title: contentRecord.title || undefined,
        annotation: contentRecord.annotation || undefined,
        tags: contentRecord.tags,
        extractedText: contentRecord.extracted_text || undefined,
        createdAt: new Date(contentRecord.created_at),
        updatedAt: new Date(contentRecord.updated_at),
      };

      return metadata;
    } catch (error) {
      this.logger.error('Error getting file metadata', { error, id });
      return null;
    }
  }
}
