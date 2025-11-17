/**
 * Thumbnail Generation Service
 * Generates thumbnails for images using sharp
 */

import sharp from 'sharp';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import type { ImageMetadata } from '../models/content.js';

/**
 * Thumbnail service configuration
 */
export interface ThumbnailConfig {
  baseDirectory: string; // Base directory for content storage
  thumbnailDirectory: string; // Directory for thumbnails (relative to baseDirectory)
  maxWidth: number; // Maximum thumbnail width
  maxHeight: number; // Maximum thumbnail height
  quality: number; // JPEG quality (1-100)
}

/**
 * Result of thumbnail generation
 */
export interface ThumbnailResult {
  success: boolean;
  thumbnailPath?: string; // Relative path to thumbnail
  metadata?: ImageMetadata; // Image metadata
  error?: string;
}

/**
 * Thumbnail Service
 * Singleton pattern - use getInstance() to get the instance
 */
export class ThumbnailService {
  private static instance: ThumbnailService | null = null;
  private config: ThumbnailConfig;

  private constructor(config: ThumbnailConfig) {
    this.config = config;

    // Ensure thumbnail directory exists
    const fullThumbnailPath = path.join(config.baseDirectory, config.thumbnailDirectory);
    if (!fs.existsSync(fullThumbnailPath)) {
      fs.mkdirSync(fullThumbnailPath, { recursive: true });
      logger.info('Created thumbnail directory', { path: fullThumbnailPath });
    }
  }

  /**
   * Get or create thumbnail service instance (singleton)
   */
  public static getInstance(config?: ThumbnailConfig): ThumbnailService {
    if (!ThumbnailService.instance) {
      if (!config) {
        throw new Error('ThumbnailConfig required for first initialization');
      }
      ThumbnailService.instance = new ThumbnailService(config);
    }
    return ThumbnailService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    ThumbnailService.instance = null;
  }

  /**
   * Generate thumbnail for an image
   * @param imageBuffer - Image buffer
   * @param filename - Filename to use for thumbnail (e.g., "uuid.jpg")
   * @returns ThumbnailResult with path and metadata
   */
  async generateThumbnail(imageBuffer: Buffer, filename: string): Promise<ThumbnailResult> {
    try {
      logger.debug('Generating thumbnail', { filename });

      // Get image metadata
      const image = sharp(imageBuffer);
      const imageMetadata = await image.metadata();

      if (!imageMetadata.width || !imageMetadata.height) {
        logger.warn('Unable to read image dimensions', { filename });
        return {
          success: false,
          error: 'Unable to read image dimensions',
        };
      }

      // Calculate thumbnail dimensions (maintain aspect ratio)
      const { width: thumbnailWidth, height: thumbnailHeight } = this.calculateThumbnailSize(
        imageMetadata.width,
        imageMetadata.height
      );

      // Generate thumbnail with sharp
      const thumbnailBuffer = await image
        .resize(thumbnailWidth, thumbnailHeight, {
          fit: 'inside', // Maintain aspect ratio, fit within dimensions
          withoutEnlargement: true, // Don't enlarge if image is smaller
        })
        .jpeg({ quality: this.config.quality }) // Convert to JPEG for consistent output
        .toBuffer();

      // Save thumbnail to file
      const thumbnailPath = path.join(this.config.thumbnailDirectory, filename);
      const fullThumbnailPath = path.join(this.config.baseDirectory, thumbnailPath);

      await fsPromises.writeFile(fullThumbnailPath, thumbnailBuffer);

      logger.info('Thumbnail generated successfully', {
        filename,
        thumbnailPath,
        originalSize: `${imageMetadata.width}x${imageMetadata.height}`,
        thumbnailSize: `${thumbnailWidth}x${thumbnailHeight}`,
        thumbnailBytes: thumbnailBuffer.length,
      });

      // Prepare metadata
      const metadata: ImageMetadata = {
        width: imageMetadata.width,
        height: imageMetadata.height,
        format: imageMetadata.format || 'unknown',
        size: imageBuffer.length,
      };

      return {
        success: true,
        thumbnailPath,
        metadata,
      };
    } catch (error) {
      logger.error('Error generating thumbnail', { error, filename });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate thumbnail dimensions while maintaining aspect ratio
   * @param width - Original width
   * @param height - Original height
   * @returns Thumbnail dimensions
   */
  private calculateThumbnailSize(
    width: number,
    height: number
  ): { width: number; height: number } {
    const maxWidth = this.config.maxWidth;
    const maxHeight = this.config.maxHeight;

    // If image is already smaller than max dimensions, use original size
    if (width <= maxWidth && height <= maxHeight) {
      return { width, height };
    }

    // Calculate scaling factor
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const scaleFactor = Math.min(widthRatio, heightRatio);

    // Calculate new dimensions
    const newWidth = Math.round(width * scaleFactor);
    const newHeight = Math.round(height * scaleFactor);

    return { width: newWidth, height: newHeight };
  }

  /**
   * Delete thumbnail
   * @param thumbnailPath - Relative path to thumbnail
   * @returns Success status
   */
  async deleteThumbnail(thumbnailPath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.config.baseDirectory, thumbnailPath);

      if (fs.existsSync(fullPath)) {
        await fsPromises.unlink(fullPath);
        logger.info('Thumbnail deleted', { thumbnailPath });
        return true;
      } else {
        logger.warn('Thumbnail not found for deletion', { thumbnailPath });
        return false;
      }
    } catch (error) {
      logger.error('Error deleting thumbnail', { error, thumbnailPath });
      return false;
    }
  }

  /**
   * Check if a file is an image
   * @param mimeType - MIME type of the file
   * @returns True if the file is an image
   */
  isImage(mimeType: string): boolean {
    const imageMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return imageMimeTypes.includes(mimeType.toLowerCase());
  }
}

/**
 * Export singleton instance getter
 */
export const getThumbnailService = (config?: ThumbnailConfig): ThumbnailService => {
  return ThumbnailService.getInstance(config);
};
