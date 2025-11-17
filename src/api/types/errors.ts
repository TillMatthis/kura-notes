/**
 * KURA Notes - API Error Types
 *
 * Consistent error response format for all API endpoints
 */

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path?: string;
}

/**
 * Error codes for consistent error handling
 */
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_API_KEY = 'INVALID_API_KEY',
  MISSING_API_KEY = 'MISSING_API_KEY',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Resource Errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',

  // File Errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',

  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  QUERY_FAILED = 'QUERY_FAILED',

  // Service Errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  VECTOR_STORE_ERROR = 'VECTOR_STORE_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',

  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to API error response format
   */
  toResponse(path?: string): ApiErrorResponse {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: new Date().toISOString(),
      path,
    };
  }
}

/**
 * Create common API errors
 */
export const ApiErrors = {
  unauthorized: (message = 'Unauthorized'): ApiError =>
    new ApiError(ErrorCode.UNAUTHORIZED, message, 401),

  forbidden: (message = 'Forbidden'): ApiError =>
    new ApiError(ErrorCode.FORBIDDEN, message, 403),

  invalidApiKey: (): ApiError =>
    new ApiError(ErrorCode.INVALID_API_KEY, 'Invalid API key', 401),

  missingApiKey: (): ApiError =>
    new ApiError(ErrorCode.MISSING_API_KEY, 'API key is required', 401),

  notFound: (resource = 'Resource'): ApiError =>
    new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`, 404),

  validationError: (message: string, details?: unknown): ApiError =>
    new ApiError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  fileTooLarge: (maxSize: number): ApiError =>
    new ApiError(
      ErrorCode.FILE_TOO_LARGE,
      `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`,
      413
    ),

  invalidFileType: (allowedTypes: string[]): ApiError =>
    new ApiError(
      ErrorCode.INVALID_FILE_TYPE,
      `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      400
    ),

  databaseError: (message = 'Database operation failed'): ApiError =>
    new ApiError(ErrorCode.DATABASE_ERROR, message, 500),

  serviceUnavailable: (service: string): ApiError =>
    new ApiError(
      ErrorCode.SERVICE_UNAVAILABLE,
      `${service} is currently unavailable`,
      503
    ),

  internalError: (message = 'Internal server error'): ApiError =>
    new ApiError(ErrorCode.INTERNAL_ERROR, message, 500),

  badRequest: (message = 'Bad request'): ApiError =>
    new ApiError(ErrorCode.BAD_REQUEST, message, 400),

  storageError: (message = 'Storage operation failed'): ApiError =>
    new ApiError(ErrorCode.UPLOAD_FAILED, message, 500),
};
