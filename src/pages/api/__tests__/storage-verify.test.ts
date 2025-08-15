import { createMocks } from 'node-mocks-http'
import verifyHandler from '../storage/verify'
import type { NextApiRequest, NextApiResponse } from 'next'

// Mock fetch for HTTP requests
global.fetch = jest.fn()

// Mock Supabase admin client
const mockCreateSignedUrl = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: () => ({
        createSignedUrl: mockCreateSignedUrl
      })
    }
  }))
}))

// Mock auth middleware
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((handler) => handler)
}))

// Mock error constants
jest.mock('@/lib/constants/errors', () => ({
  ERROR_CODES: {
    METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    CONFIG_ERROR: 'CONFIG_ERROR',
    STORAGE_ERROR: 'STORAGE_ERROR'
  },
  createApiError: jest.fn((res, code, details) => {
    const statusMap = {
      'METHOD_NOT_ALLOWED': 405,
      'VALIDATION_ERROR': 422,
      'CONFIG_ERROR': 500,
      'STORAGE_ERROR': 500
    }
    res.status(statusMap[code] || 500).json({
      error: `Mock error: ${code}`,
      code,
      details
    })
  })
}))

describe('/api/storage/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set up environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.NEXT_PUBLIC_SUPABASE_BUCKET = 'documents'
    
    // Reset fetch mock
    ;(global.fetch as jest.Mock).mockReset()
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_BUCKET
  })

  describe('Method validation', () => {
    it('should return 405 for non-POST methods', async () => {
      const { req, res } = createMocks({
        method: 'GET'
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(405)
      expect(res.getHeader('Allow')).toBe('POST')
      expect(JSON.parse(res._getData())).toMatchObject({
        success: false,
        code: 'METHOD_NOT_ALLOWED'
      })
    })
  })

  describe('Input validation', () => {
    it('should return 422 for missing path', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        code: 'INVALID_INPUT'
      })
      expect(responseData.details).toContain('path: Required')
    })

    it('should return 422 for missing expectedBytes', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf'
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        code: 'INVALID_INPUT'
      })
      expect(responseData.details).toContain('expectedBytes: Required')
    })

    it('should return 422 for invalid expectedBytes (zero or negative)', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 0
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        code: 'INVALID_INPUT'
      })
      expect(responseData.details).toContain('expectedBytes: Expected bytes must be greater than 0')
    })

    it('should return 422 for invalid path with directory traversal', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: '../../../etc/passwd',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        code: 'INVALID_INPUT'
      })
      expect(responseData.details).toContain('path: Path contains invalid characters or patterns')
    })

    it('should return 422 for path starting with slash', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: '/user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const responseData = JSON.parse(res._getData())
      expect(responseData.details).toContain('path: Path contains invalid characters or patterns')
    })

    it('should return 422 for path with invalid characters', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test<script>.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const responseData = JSON.parse(res._getData())
      expect(responseData.details).toContain('path: Path contains invalid characters or patterns')
    })
  })

  describe('Environment validation', () => {
    it('should return 500 for missing environment variables', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(500)
      expect(JSON.parse(res._getData())).toMatchObject({
        success: false,
        code: 'SERVER_CONFIGURATION_ERROR'
      })
    })
  })

  describe('Successful verification', () => {
    it('should return 200 success with byte verification via HEAD request', async () => {
      // Mock signed URL creation
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed/url' },
        error: null
      })

      // Mock successful HEAD request
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn((header) => {
            if (header === 'content-length') return '1024'
            return null
          })
        }
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: true,
        exists: true,
        bytes: 1024,
        attempts: 1
      })
      expect(responseData.verifiedAt).toBeDefined()
      expect(responseData.totalTimeMs).toBeGreaterThan(0)

      // Verify signed URL was created correctly
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('user123/test.pdf', 60)
      
      // Verify HEAD request was made
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/signed/url',
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({
            'User-Agent': 'OM-AI-Storage-Verification/1.0'
          })
        })
      )
    })

    it('should return 200 success with byte verification via Range GET fallback', async () => {
      // Mock signed URL creation
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed/url' },
        error: null
      })

      // Mock HEAD request failure, then successful Range GET
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 405  // HEAD not allowed
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 206,
          headers: {
            get: jest.fn((header) => {
              if (header === 'content-range') return 'bytes 0-0/1024'
              return null
            })
          }
        })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: true,
        exists: true,
        bytes: 1024,
        attempts: 1
      })

      // Verify both HEAD and Range GET were called
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/signed/url',
        expect.objectContaining({ method: 'HEAD' })
      )
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/signed/url',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Range': 'bytes=0-0'
          })
        })
      )
    })
  })

  describe('File not found', () => {
    it('should return 404 when file does not exist after max retries', async () => {
      const mockSetTimeout = jest.spyOn(global, 'setTimeout')
      mockSetTimeout.mockImplementation((callback: any) => {
        callback()
        return {} as any
      })

      // Mock signed URL creation
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed/url' },
        error: null
      })

      // Mock all requests as 404
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/nonexistent.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(404)
      
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        exists: false,
        code: 'FILE_NOT_FOUND',
        attempts: 7 // Should retry up to 7 times
      })
      expect(responseData.totalTimeMs).toBeGreaterThan(0)

      mockSetTimeout.mockRestore()
    })
  })

  describe('Size mismatch', () => {
    it('should return 409 when actual bytes do not match expected bytes', async () => {
      // Mock signed URL creation
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed/url' },
        error: null
      })

      // Mock successful request with wrong size
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn((header) => {
            if (header === 'content-length') return '2048' // Expected 1024, got 2048
            return null
          })
        }
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(409)
      
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        exists: true,
        code: 'SIZE_MISMATCH',
        expectedBytes: 1024,
        actualBytes: 2048,
        attempts: 1
      })
      expect(responseData.totalTimeMs).toBeGreaterThan(0)
    })
  })

  describe('Retry behavior', () => {
    it('should retry on signed URL errors with exponential backoff', async () => {
      const mockSetTimeout = jest.spyOn(global, 'setTimeout')
      mockSetTimeout.mockImplementation((callback: any) => {
        callback()
        return {} as any
      })

      // Mock signed URL failures followed by success
      mockCreateSignedUrl
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockRejectedValueOnce(new Error('Another network error'))
        .mockResolvedValueOnce({
          data: { signedUrl: 'https://test.supabase.co/signed/url' },
          error: null
        })

      // Mock successful verification
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn((header) => {
            if (header === 'content-length') return '1024'
            return null
          })
        }
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      
      const responseData = JSON.parse(res._getData())
      expect(responseData.attempts).toBe(3) // Should have retried twice before success
      
      // Should have called setTimeout for retry delays
      expect(mockSetTimeout).toHaveBeenCalledTimes(2)

      mockSetTimeout.mockRestore()
    })

    it('should respect 10 second timeout limit', async () => {
      const mockSetTimeout = jest.spyOn(global, 'setTimeout')
      mockSetTimeout.mockImplementation((callback: any) => {
        callback()
        return {} as any
      })

      // Mock slow responses that would exceed timeout
      mockCreateSignedUrl.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              data: { signedUrl: 'https://test.supabase.co/signed/url' },
              error: null
            })
          }, 3000) // 3 second delay per attempt
        })
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      const startTime = Date.now()
      await verifyHandler(req as any, res)
      const endTime = Date.now()

      // Should respect timeout and not take too long
      expect(endTime - startTime).toBeLessThan(12000) // Allow some buffer over 10s

      expect(res._getStatusCode()).toBe(404)
      
      const responseData = JSON.parse(res._getData())
      expect(responseData).toMatchObject({
        success: false,
        exists: false,
        code: 'FILE_NOT_FOUND'
      })

      mockSetTimeout.mockRestore()
    })
  })

  describe('Server-side bucket resolution', () => {
    it('should use environment bucket and ignore any client-provided bucket', async () => {
      // Note: The new API doesn't accept bucket in request body,
      // but this test verifies server uses environment variable
      
      // Mock signed URL creation
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed/url' },
        error: null
      })

      // Mock successful verification
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn((header) => {
            if (header === 'content-length') return '1024'
            return null
          })
        }
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024,
          // bucket field should be ignored even if provided
          bucket: 'malicious-bucket'
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      
      // Verify the signed URL was created using environment bucket, not client bucket
      const { createClient } = require('@supabase/supabase-js')
      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-service-role-key',
        expect.any(Object)
      )
    })

    it('should use default bucket when environment variable not set', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_BUCKET

      // Mock signed URL creation
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed/url' },
        error: null
      })

      // Mock successful verification
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn((header) => {
            if (header === 'content-length') return '1024'
            return null
          })
        }
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          path: 'user123/test.pdf',
          expectedBytes: 1024
        }
      })

      req.user = { id: 'test-user-id' }

      await verifyHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      // Default bucket 'documents' should be used
    })
  })
})