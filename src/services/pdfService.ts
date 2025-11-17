/**
 * KURA Notes - PDF Service
 *
 * Handles PDF metadata extraction using pdf-parse
 */

import { logger } from '../utils/logger.js';
import type { PdfMetadata } from '../models/content.js';

// Import pdf-parse using require for compatibility
const PDFParse = require('pdf-parse');

/**
 * PDF Service for metadata extraction
 * Singleton pattern
 */
export class PdfService {
  private static instance: PdfService | null = null;

  private constructor() {
    logger.debug('PDF service initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PdfService {
    if (!PdfService.instance) {
      PdfService.instance = new PdfService();
    }
    return PdfService.instance;
  }

  /**
   * Extract metadata from PDF buffer
   * @param buffer PDF file buffer
   * @param filename Original filename
   * @returns PDF metadata
   */
  public async extractMetadata(buffer: Buffer, filename: string): Promise<PdfMetadata> {
    try {
      logger.debug('Extracting PDF metadata', { filename, size: buffer.length });

      // Parse PDF to get page count
      const pdfData = await PDFParse(buffer);

      const metadata: PdfMetadata = {
        filename,
        size: buffer.length,
        pageCount: pdfData.numpages,
      };

      logger.info('PDF metadata extracted successfully', {
        filename,
        size: metadata.size,
        pageCount: metadata.pageCount,
      });

      return metadata;
    } catch (error) {
      logger.warn('Failed to extract PDF metadata, using basic info', {
        filename,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // If pdf-parse fails, return basic metadata without page count
      return {
        filename,
        size: buffer.length,
      };
    }
  }

  /**
   * Check if a buffer appears to be a valid PDF
   * @param buffer File buffer
   * @returns true if buffer starts with PDF magic number
   */
  public isValidPdf(buffer: Buffer): boolean {
    if (buffer.length < 4) {
      return false;
    }

    // Check for PDF magic number: %PDF
    const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    return buffer.slice(0, 4).equals(pdfMagic);
  }

  /**
   * Format file size for display
   * @param bytes File size in bytes
   * @returns Formatted string (e.g., "1.5 MB")
   */
  public formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  }

  /**
   * Check if file size is large (>10MB)
   * @param bytes File size in bytes
   * @returns true if file is larger than 10MB
   */
  public isLargeFile(bytes: number): boolean {
    return bytes > 10 * 1024 * 1024; // 10 MB threshold
  }
}

// Export singleton instance
export const pdfService = PdfService.getInstance();
