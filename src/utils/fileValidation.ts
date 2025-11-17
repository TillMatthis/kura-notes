/**
 * File validation utilities
 */

import {
  ContentType,
  FileValidationResult,
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '../models/file.js';

/**
 * Validates file type against supported MIME types
 */
export function validateFileType(
  contentType: ContentType,
  mimeType: string
): FileValidationResult {
  const supportedTypes = SUPPORTED_MIME_TYPES[contentType];

  if (!supportedTypes.includes(mimeType as never)) {
    return {
      valid: false,
      error: `Unsupported MIME type "${mimeType}" for content type "${contentType}". Supported types: ${supportedTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates file size against limits
 */
export function validateFileSize(
  contentType: ContentType,
  sizeInBytes: number
): FileValidationResult {
  const maxSize = MAX_FILE_SIZE[contentType];

  if (sizeInBytes > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const actualSizeMB = (sizeInBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size ${actualSizeMB}MB exceeds maximum allowed size of ${maxSizeMB}MB for ${contentType} files`,
    };
  }

  if (sizeInBytes === 0) {
    return {
      valid: false,
      error: 'File is empty (0 bytes)',
    };
  }

  return { valid: true };
}

/**
 * Validates complete file (type and size)
 */
export function validateFile(
  contentType: ContentType,
  mimeType: string,
  sizeInBytes: number
): FileValidationResult {
  // Validate type
  const typeValidation = validateFileType(contentType, mimeType);
  if (!typeValidation.valid) {
    return typeValidation;
  }

  // Validate size
  const sizeValidation = validateFileSize(contentType, sizeInBytes);
  if (!sizeValidation.valid) {
    return sizeValidation;
  }

  return { valid: true };
}

/**
 * Infers MIME type from file extension
 */
export function inferMimeType(filename: string): string | undefined {
  const ext = filename.toLowerCase().split('.').pop();

  const mimeTypeMap: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
  };

  return ext ? mimeTypeMap[ext] : undefined;
}

/**
 * Determines content type from MIME type
 */
export function getContentTypeFromMime(mimeType: string): ContentType | undefined {
  for (const [contentType, mimeTypes] of Object.entries(SUPPORTED_MIME_TYPES)) {
    if (mimeTypes.includes(mimeType as never)) {
      return contentType as ContentType;
    }
  }
  return undefined;
}
