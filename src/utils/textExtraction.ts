/**
 * KURA Notes - Text Extraction Utility
 *
 * Extracts text from different content types for embedding generation
 * - Text: full content
 * - Images: annotation only (no OCR yet)
 * - PDFs: filename + annotation (no text extraction yet)
 */

import { logger } from './logger.js';
import type { ContentType } from '../models/content.js';

/**
 * Extract text for embedding from content based on type
 *
 * @param contentType - Type of content
 * @param content - The actual content (text string or buffer)
 * @param annotation - User-provided annotation/context
 * @param title - Content title
 * @param originalFilename - Original filename (for PDFs/images)
 * @returns Extracted text suitable for embedding generation
 */
export function extractTextForEmbedding(
  contentType: ContentType,
  content: string | Buffer,
  annotation?: string | null,
  title?: string | null,
  originalFilename?: string
): string {
  logger.debug('Extracting text for embedding', {
    contentType,
    hasAnnotation: !!annotation,
    hasTitle: !!title,
    hasOriginalFilename: !!originalFilename,
  });

  let extractedText = '';

  switch (contentType) {
    case 'text':
      // For text content, use the full text
      if (typeof content === 'string') {
        extractedText = content;
      } else {
        // Convert buffer to string if needed
        extractedText = content.toString('utf-8');
      }

      // Add title if available and not already in content
      if (title && !extractedText.toLowerCase().includes(title.toLowerCase())) {
        extractedText = `${title}\n\n${extractedText}`;
      }

      // Add annotation if available
      if (annotation) {
        extractedText = `${extractedText}\n\nContext: ${annotation}`;
      }
      break;

    case 'image':
      // For images, use annotation only (no OCR yet)
      // Include title if available
      const imageParts: string[] = [];

      if (title) {
        imageParts.push(`Image: ${title}`);
      } else if (originalFilename) {
        imageParts.push(`Image: ${originalFilename}`);
      } else {
        imageParts.push('Image');
      }

      if (annotation) {
        imageParts.push(annotation);
      }

      extractedText = imageParts.join('\n\n');

      // If no annotation or title, use a default description
      if (!extractedText.trim()) {
        extractedText = 'Image content (no description provided)';
      }
      break;

    case 'pdf':
      // For PDFs, use filename + annotation (no text extraction yet)
      const pdfParts: string[] = [];

      if (title) {
        pdfParts.push(`PDF Document: ${title}`);
      } else if (originalFilename) {
        pdfParts.push(`PDF Document: ${originalFilename}`);
      } else {
        pdfParts.push('PDF Document');
      }

      if (annotation) {
        pdfParts.push(annotation);
      }

      extractedText = pdfParts.join('\n\n');

      // If no annotation or title, use a default description
      if (!extractedText.trim() || extractedText === 'PDF Document') {
        extractedText = 'PDF document (no description provided)';
      }
      break;

    case 'audio':
      // For audio, use annotation only (no transcription yet)
      const audioParts: string[] = [];

      if (title) {
        audioParts.push(`Audio: ${title}`);
      } else if (originalFilename) {
        audioParts.push(`Audio: ${originalFilename}`);
      } else {
        audioParts.push('Audio');
      }

      if (annotation) {
        audioParts.push(annotation);
      }

      extractedText = audioParts.join('\n\n');

      // If no annotation or title, use a default description
      if (!extractedText.trim()) {
        extractedText = 'Audio content (no description provided)';
      }
      break;

    default:
      logger.warn('Unknown content type for text extraction', { contentType });
      extractedText = annotation || title || 'Unknown content';
  }

  logger.debug('Text extraction completed', {
    contentType,
    extractedLength: extractedText.length,
  });

  return extractedText.trim();
}

/**
 * Validate that extracted text is suitable for embedding
 *
 * @param text - Extracted text
 * @returns true if text is valid for embedding, false otherwise
 */
export function validateEmbeddingText(text: string): boolean {
  // Must have some content
  if (!text || text.trim().length === 0) {
    logger.warn('Empty text for embedding');
    return false;
  }

  // Should have at least a few characters
  if (text.trim().length < 3) {
    logger.warn('Text too short for meaningful embedding', {
      length: text.trim().length,
    });
    return false;
  }

  return true;
}
