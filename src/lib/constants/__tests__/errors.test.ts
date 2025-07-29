/**
 * Unit Tests for Centralized Error Code System
 * 
 * Tests the error code enumeration, message mappings, and helper functions
 * to ensure consistent error handling across the platform.
 */

import {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_STATUS_CODES,
  createApiError,
  isClientError,
  isServerError,
  isRetryableError,
  RETRYABLE_ERROR_CODES,
  type TypedApiError
} from '../errors';

// Mock response object for testing
const mockResponse = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
};

describe('Error Code System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ERROR_CODES enum', () => {
    it('should have all required error codes', () => {
      const requiredCodes = [
        'MISSING_TOKEN',
        'INVALID_TOKEN',
        'METHOD_NOT_ALLOWED',
        'OPENAI_NOT_CONFIGURED',
        'RATE_LIMIT_EXCEEDED',
        'NO_FILE',
        'DATABASE_ERROR',
        'OM_VALIDATION_FAILED',
        'PROMPT_INJECTION_DETECTED'
      ];

      requiredCodes.forEach(code => {
        expect(ERROR_CODES).toHaveProperty(code);
      });
    });

    it('should have consistent error code values', () => {
      expect(ERROR_CODES.MISSING_TOKEN).toBe('MISSING_TOKEN');
      expect(ERROR_CODES.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(ERROR_CODES.OPENAI_ERROR).toBe('OPENAI_ERROR');
    });
  });

  describe('ERROR_MESSAGES mapping', () => {
    it('should have messages for all error codes', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(ERROR_MESSAGES).toHaveProperty(code);
        expect(ERROR_MESSAGES[code]).toBeTruthy();
        expect(typeof ERROR_MESSAGES[code]).toBe('string');
      });
    });

    it('should have user-friendly messages', () => {
      expect(ERROR_MESSAGES[ERROR_CODES.MISSING_TOKEN]).toBe('Authentication token is required');
      expect(ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_EXCEEDED]).toBe('Too many requests, please try again later');
      expect(ERROR_MESSAGES[ERROR_CODES.OM_VALIDATION_FAILED]).toBe('OM analysis validation failed');
    });

    it('should not expose technical details to users', () => {
      Object.values(ERROR_MESSAGES).forEach(message => {
        // Allow "error" in user-friendly context like "AI service error occurred"
        // but check that messages don't contain technical jargon
        expect(message).not.toMatch(/\b(null|undefined|exception|stack|trace)\b/i);
        expect(message).not.toContain('TypeError');
        expect(message).not.toContain('ReferenceError');
      });
    });
  });

  describe('ERROR_STATUS_CODES mapping', () => {
    it('should have status codes for all error codes', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(ERROR_STATUS_CODES).toHaveProperty(code);
        expect(typeof ERROR_STATUS_CODES[code]).toBe('number');
        expect(ERROR_STATUS_CODES[code]).toBeGreaterThanOrEqual(400);
        expect(ERROR_STATUS_CODES[code]).toBeLessThan(600);
      });
    });

    it('should use appropriate HTTP status codes', () => {
      expect(ERROR_STATUS_CODES[ERROR_CODES.MISSING_TOKEN]).toBe(401);
      expect(ERROR_STATUS_CODES[ERROR_CODES.UNAUTHORIZED]).toBe(401);
      expect(ERROR_STATUS_CODES[ERROR_CODES.FORBIDDEN]).toBe(403);
      expect(ERROR_STATUS_CODES[ERROR_CODES.METHOD_NOT_ALLOWED]).toBe(405);
      expect(ERROR_STATUS_CODES[ERROR_CODES.RATE_LIMIT_EXCEEDED]).toBe(429);
      expect(ERROR_STATUS_CODES[ERROR_CODES.INTERNAL_ERROR]).toBe(500);
    });
  });

  describe('createApiError function', () => {
    it('should create proper error response', () => {
      const testDate = new Date('2025-01-01T00:00:00.000Z');
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(testDate.toISOString());

      createApiError(mockResponse, ERROR_CODES.MISSING_TOKEN);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication token is required',
        code: 'MISSING_TOKEN',
        timestamp: testDate.toISOString()
      });
    });

    it('should include details when provided', () => {
      createApiError(mockResponse, ERROR_CODES.DATABASE_ERROR, 'Connection timeout');

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Database operation failed',
        code: 'DATABASE_ERROR',
        details: 'Connection timeout',
        timestamp: expect.any(String)
      });
    });

    it('should use custom message when provided', () => {
      createApiError(
        mockResponse, 
        ERROR_CODES.OPENAI_ERROR, 
        undefined, 
        'Custom OpenAI error message'
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Custom OpenAI error message',
        code: 'OPENAI_ERROR',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error classification helpers', () => {
    describe('isClientError', () => {
      it('should identify client errors (4xx)', () => {
        expect(isClientError(ERROR_CODES.MISSING_TOKEN)).toBe(true);
        expect(isClientError(ERROR_CODES.INVALID_TOKEN)).toBe(true);
        expect(isClientError(ERROR_CODES.METHOD_NOT_ALLOWED)).toBe(true);
        expect(isClientError(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(true);
      });

      it('should not identify server errors as client errors', () => {
        expect(isClientError(ERROR_CODES.INTERNAL_ERROR)).toBe(false);
        expect(isClientError(ERROR_CODES.DATABASE_ERROR)).toBe(false);
        expect(isClientError(ERROR_CODES.OPENAI_ERROR)).toBe(false);
      });
    });

    describe('isServerError', () => {
      it('should identify server errors (5xx)', () => {
        expect(isServerError(ERROR_CODES.INTERNAL_ERROR)).toBe(true);
        expect(isServerError(ERROR_CODES.DATABASE_ERROR)).toBe(true);
        expect(isServerError(ERROR_CODES.OPENAI_ERROR)).toBe(true);
        expect(isServerError(ERROR_CODES.OPENAI_NOT_CONFIGURED)).toBe(true);
      });

      it('should not identify client errors as server errors', () => {
        expect(isServerError(ERROR_CODES.MISSING_TOKEN)).toBe(false);
        expect(isServerError(ERROR_CODES.INVALID_TOKEN)).toBe(false);
        expect(isServerError(ERROR_CODES.METHOD_NOT_ALLOWED)).toBe(false);
      });
    });

    describe('isRetryableError', () => {
      it('should identify retryable errors', () => {
        expect(isRetryableError(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(true);
        expect(isRetryableError(ERROR_CODES.OPENAI_ERROR)).toBe(true);
        expect(isRetryableError(ERROR_CODES.DATABASE_ERROR)).toBe(true);
        expect(isRetryableError(ERROR_CODES.STORAGE_ERROR)).toBe(true);
        expect(isRetryableError(ERROR_CODES.INTERNAL_ERROR)).toBe(true);
      });

      it('should not identify non-retryable errors', () => {
        expect(isRetryableError(ERROR_CODES.MISSING_TOKEN)).toBe(false);
        expect(isRetryableError(ERROR_CODES.INVALID_TOKEN)).toBe(false);
        expect(isRetryableError(ERROR_CODES.METHOD_NOT_ALLOWED)).toBe(false);
        expect(isRetryableError(ERROR_CODES.PROMPT_INJECTION_DETECTED)).toBe(false);
      });
    });
  });

  describe('RETRYABLE_ERROR_CODES set', () => {
    it('should contain appropriate retryable errors', () => {
      const expectedRetryable = [
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        ERROR_CODES.OPENAI_ERROR,
        ERROR_CODES.DATABASE_ERROR,
        ERROR_CODES.STORAGE_ERROR,
        ERROR_CODES.INTERNAL_ERROR,
        ERROR_CODES.UPLOAD_ERROR
      ];

      expectedRetryable.forEach(code => {
        expect(RETRYABLE_ERROR_CODES.has(code)).toBe(true);
      });
    });

    it('should not contain non-retryable errors', () => {
      const nonRetryable = [
        ERROR_CODES.MISSING_TOKEN,
        ERROR_CODES.INVALID_TOKEN,
        ERROR_CODES.METHOD_NOT_ALLOWED,
        ERROR_CODES.PROMPT_INJECTION_DETECTED,
        ERROR_CODES.CONTENT_POLICY_VIOLATION
      ];

      nonRetryable.forEach(code => {
        expect(RETRYABLE_ERROR_CODES.has(code)).toBe(false);
      });
    });
  });

  describe('TypedApiError interface', () => {
    it('should match the structure created by createApiError', () => {
      const testDate = new Date('2025-01-01T00:00:00.000Z');
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(testDate.toISOString());

      createApiError(mockResponse, ERROR_CODES.MISSING_TOKEN, 'Test details');

      const expectedResponse: TypedApiError = {
        error: 'Authentication token is required',
        code: ERROR_CODES.MISSING_TOKEN,
        details: 'Test details',
        timestamp: testDate.toISOString()
      };

      expect(mockResponse.json).toHaveBeenCalledWith(expectedResponse);
    });
  });

  describe('Error code completeness', () => {
    it('should have same number of codes, messages, and status codes', () => {
      const codeCount = Object.keys(ERROR_CODES).length;
      const messageCount = Object.keys(ERROR_MESSAGES).length;
      const statusCount = Object.keys(ERROR_STATUS_CODES).length;

      expect(messageCount).toBe(codeCount);
      expect(statusCount).toBe(codeCount);
    });

    it('should have all codes represented in mappings', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
        expect(ERROR_STATUS_CODES[code]).toBeDefined();
      });
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive information in error messages', () => {
      const sensitivePatterns = [
        /password/i,
        /\b(api.*key|secret.*key|private.*key)\b/i,
        /database.*connection.*string/i,
        /credentials/i
      ];

      Object.values(ERROR_MESSAGES).forEach(message => {
        sensitivePatterns.forEach(pattern => {
          // Exception for "Authentication token is required" which is user-friendly
          if (message === 'Authentication token is required' && pattern.toString().includes('token')) {
            return;
          }
          expect(message).not.toMatch(pattern);
        });
      });
    });

    it('should use generic messages for security-related errors', () => {
      expect(ERROR_MESSAGES[ERROR_CODES.INVALID_TOKEN]).not.toContain('expired');
      expect(ERROR_MESSAGES[ERROR_CODES.INVALID_TOKEN]).not.toContain('malformed');
      expect(ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED]).toBe('Authentication required to access this resource');
    });
  });
});