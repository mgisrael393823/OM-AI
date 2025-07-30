/**
 * Centralized Error Codes for OM-AI Platform
 * 
 * IMPORTANT: All error codes must be used consistently across the entire project.
 * When adding new codes, update this enum and corresponding message mappings.
 * Replace all inline error strings throughout the codebase with these enum values.
 */

export enum ERROR_CODES {
  // Authentication & Authorization
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  
  // Method & Request Validation
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  MISSING_MESSAGE = 'MISSING_MESSAGE',
  INVALID_MESSAGES = 'INVALID_MESSAGES',
  INVALID_REQUEST_FORMAT = 'INVALID_REQUEST_FORMAT',
  
  // OpenAI & Chat Service
  OPENAI_NOT_CONFIGURED = 'OPENAI_NOT_CONFIGURED',
  OPENAI_ERROR = 'OPENAI_ERROR',
  CHAT_ERROR = 'CHAT_ERROR',
  INVALID_JSON_RESPONSE = 'INVALID_JSON_RESPONSE',
  TOKEN_LIMIT_EXCEEDED = 'TOKEN_LIMIT_EXCEEDED',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // File Upload & Processing
  NO_FILE = 'NO_FILE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_ERROR = 'UPLOAD_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  PDF_VALIDATION_FAILED = 'PDF_VALIDATION_FAILED',
  INVALID_PDF = 'INVALID_PDF',
  
  // Database Operations
  DATABASE_ERROR = 'DATABASE_ERROR',
  SESSION_ERROR = 'SESSION_ERROR',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // Document Processing
  DOCUMENT_CONTEXT_ERROR = 'DOCUMENT_CONTEXT_ERROR',
  SEARCH_ERROR = 'SEARCH_ERROR',
  
  // OM Analysis Specific
  OM_VALIDATION_FAILED = 'OM_VALIDATION_FAILED',
  OM_PARSING_ERROR = 'OM_PARSING_ERROR',
  OM_SCHEMA_MISMATCH = 'OM_SCHEMA_MISMATCH',
  
  // Security
  CONTENT_POLICY_VIOLATION = 'CONTENT_POLICY_VIOLATION',
  PROMPT_INJECTION_DETECTED = 'PROMPT_INJECTION_DETECTED',
  INPUT_SANITIZATION_FAILED = 'INPUT_SANITIZATION_FAILED',
  
  // Configuration & Environment
  CONFIG_ERROR = 'CONFIG_ERROR',
  ENVIRONMENT_ERROR = 'ENVIRONMENT_ERROR',
  
  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

/**
 * User-friendly error messages for each error code
 */
export const ERROR_MESSAGES: Record<ERROR_CODES, string> = {
  // Authentication & Authorization
  [ERROR_CODES.MISSING_TOKEN]: 'Authentication token is required',
  [ERROR_CODES.INVALID_TOKEN]: 'Invalid authentication token',
  [ERROR_CODES.UNAUTHORIZED]: 'Authentication required to access this resource',
  [ERROR_CODES.FORBIDDEN]: 'You do not have permission to access this resource',
  
  // Method & Request Validation
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 'HTTP method not allowed for this endpoint',
  [ERROR_CODES.MISSING_MESSAGE]: 'Message is required',
  [ERROR_CODES.INVALID_MESSAGES]: 'Invalid messages format',
  [ERROR_CODES.INVALID_REQUEST_FORMAT]: 'Request format is invalid',
  
  // OpenAI & Chat Service
  [ERROR_CODES.OPENAI_NOT_CONFIGURED]: 'AI service is temporarily unavailable',
  [ERROR_CODES.OPENAI_ERROR]: 'AI service error occurred',
  [ERROR_CODES.CHAT_ERROR]: 'Failed to process chat request',
  [ERROR_CODES.INVALID_JSON_RESPONSE]: 'AI returned invalid response format',
  [ERROR_CODES.TOKEN_LIMIT_EXCEEDED]: 'Message too long, please shorten your request',
  
  // Rate Limiting
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests, please try again later',
  
  // File Upload & Processing
  [ERROR_CODES.NO_FILE]: 'No file was uploaded',
  [ERROR_CODES.FILE_TOO_LARGE]: 'File size exceeds maximum limit',
  [ERROR_CODES.INVALID_FILE_TYPE]: 'Invalid file type, only PDF files allowed',
  [ERROR_CODES.UPLOAD_ERROR]: 'File upload failed',
  [ERROR_CODES.STORAGE_ERROR]: 'File storage error occurred',
  [ERROR_CODES.PDF_VALIDATION_FAILED]: 'PDF file validation failed',
  [ERROR_CODES.INVALID_PDF]: 'Invalid PDF file format',
  
  // Database Operations
  [ERROR_CODES.DATABASE_ERROR]: 'Database operation failed',
  [ERROR_CODES.SESSION_ERROR]: 'Session management error',
  [ERROR_CODES.SESSION_NOT_FOUND]: 'Chat session not found',
  [ERROR_CODES.USER_NOT_FOUND]: 'User account not found',
  
  // Document Processing
  [ERROR_CODES.DOCUMENT_CONTEXT_ERROR]: 'Failed to process document context',
  [ERROR_CODES.SEARCH_ERROR]: 'Document search failed',
  
  // OM Analysis Specific
  [ERROR_CODES.OM_VALIDATION_FAILED]: 'OM analysis validation failed',
  [ERROR_CODES.OM_PARSING_ERROR]: 'Failed to parse offering memorandum',
  [ERROR_CODES.OM_SCHEMA_MISMATCH]: 'OM response does not match expected format',
  
  // Security
  [ERROR_CODES.CONTENT_POLICY_VIOLATION]: 'Content violates usage policies',
  [ERROR_CODES.PROMPT_INJECTION_DETECTED]: 'Security violation detected in input',
  [ERROR_CODES.INPUT_SANITIZATION_FAILED]: 'Input validation failed',
  
  // Configuration & Environment
  [ERROR_CODES.CONFIG_ERROR]: 'Server configuration error',
  [ERROR_CODES.ENVIRONMENT_ERROR]: 'Environment setup error',
  
  // Generic Errors
  [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error occurred',
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred',
  [ERROR_CODES.VALIDATION_ERROR]: 'Data validation failed'
};

/**
 * HTTP status codes for each error type
 */
export const ERROR_STATUS_CODES: Record<ERROR_CODES, number> = {
  // Authentication & Authorization (401, 403)
  [ERROR_CODES.MISSING_TOKEN]: 401,
  [ERROR_CODES.INVALID_TOKEN]: 401,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  
  // Method & Request Validation (400, 405)
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 405,
  [ERROR_CODES.MISSING_MESSAGE]: 400,
  [ERROR_CODES.INVALID_MESSAGES]: 400,
  [ERROR_CODES.INVALID_REQUEST_FORMAT]: 400,
  
  // OpenAI & Chat Service (500, 503)
  [ERROR_CODES.OPENAI_NOT_CONFIGURED]: 503,
  [ERROR_CODES.OPENAI_ERROR]: 500,
  [ERROR_CODES.CHAT_ERROR]: 500,
  [ERROR_CODES.INVALID_JSON_RESPONSE]: 500,
  [ERROR_CODES.TOKEN_LIMIT_EXCEEDED]: 413,
  
  // Rate Limiting (429)
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
  
  // File Upload & Processing (400, 413)
  [ERROR_CODES.NO_FILE]: 400,
  [ERROR_CODES.FILE_TOO_LARGE]: 413,
  [ERROR_CODES.INVALID_FILE_TYPE]: 400,
  [ERROR_CODES.UPLOAD_ERROR]: 500,
  [ERROR_CODES.STORAGE_ERROR]: 500,
  [ERROR_CODES.PDF_VALIDATION_FAILED]: 400,
  [ERROR_CODES.INVALID_PDF]: 400,
  
  // Database Operations (500, 404)
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.SESSION_ERROR]: 500,
  [ERROR_CODES.SESSION_NOT_FOUND]: 404,
  [ERROR_CODES.USER_NOT_FOUND]: 404,
  
  // Document Processing (500)
  [ERROR_CODES.DOCUMENT_CONTEXT_ERROR]: 500,
  [ERROR_CODES.SEARCH_ERROR]: 500,
  
  // OM Analysis Specific (400, 422)
  [ERROR_CODES.OM_VALIDATION_FAILED]: 422,
  [ERROR_CODES.OM_PARSING_ERROR]: 422,
  [ERROR_CODES.OM_SCHEMA_MISMATCH]: 422,
  
  // Security (400, 403)
  [ERROR_CODES.CONTENT_POLICY_VIOLATION]: 403,
  [ERROR_CODES.PROMPT_INJECTION_DETECTED]: 400,
  [ERROR_CODES.INPUT_SANITIZATION_FAILED]: 400,
  
  // Configuration & Environment (500)
  [ERROR_CODES.CONFIG_ERROR]: 500,
  [ERROR_CODES.ENVIRONMENT_ERROR]: 500,
  
  // Generic Errors (500, 422)
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.UNKNOWN_ERROR]: 500,
  [ERROR_CODES.VALIDATION_ERROR]: 422
};

/**
 * Typed error response interface
 */
export interface TypedApiError {
  error: string;
  code: ERROR_CODES;
  details?: string;
  timestamp?: string;
}

/**
 * Enhanced API error response helper
 * @param res - Next.js response object
 * @param code - Error code from enum
 * @param details - Optional additional details
 * @param customMessage - Optional custom message override
 */
export function createApiError(
  res: any, 
  code: ERROR_CODES, 
  details?: string,
  customMessage?: string
): void {
  const statusCode = ERROR_STATUS_CODES[code];
  const message = customMessage || ERROR_MESSAGES[code];
  
  const errorResponse: TypedApiError = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
    ...(details && { details })
  };
  
  res.status(statusCode).json(errorResponse);
}

/**
 * Check if an error code indicates a client error (4xx)
 * @param code - Error code to check
 * @returns True if client error
 */
export function isClientError(code: ERROR_CODES): boolean {
  const statusCode = ERROR_STATUS_CODES[code];
  return statusCode >= 400 && statusCode < 500;
}

/**
 * Check if an error code indicates a server error (5xx)
 * @param code - Error code to check
 * @returns True if server error
 */
export function isServerError(code: ERROR_CODES): boolean {
  const statusCode = ERROR_STATUS_CODES[code];
  return statusCode >= 500;
}

/**
 * Get retry-able error codes (temporary failures)
 */
export const RETRYABLE_ERROR_CODES: Set<ERROR_CODES> = new Set([
  ERROR_CODES.RATE_LIMIT_EXCEEDED,
  ERROR_CODES.OPENAI_ERROR,
  ERROR_CODES.DATABASE_ERROR,
  ERROR_CODES.STORAGE_ERROR,
  ERROR_CODES.INTERNAL_ERROR,
  ERROR_CODES.UPLOAD_ERROR
]);

/**
 * Check if an error code indicates a retryable error
 * @param code - Error code to check
 * @returns True if error is retryable
 */
export function isRetryableError(code: ERROR_CODES): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}