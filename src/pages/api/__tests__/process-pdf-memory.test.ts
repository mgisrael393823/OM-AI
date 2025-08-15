import { createMocks } from 'node-mocks-http'
import { NextApiRequest, NextApiResponse } from 'next'
import processMemoryHandler from '../process-pdf-memory'
import { withAuth } from '@/lib/auth-middleware'
import formidable from 'formidable'
import { promises as fs } from 'fs'
import path from 'path'

// Mock the auth middleware to simulate authenticated requests
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler
}))

// Mock the document processor
jest.mock('@/lib/document-processor', () => ({
  processInMemory: jest.fn()
}))

// Mock canvas loader to prevent import issues
jest.mock('@/lib/canvas-loader', () => ({
  getCanvasStatus: () => ({ available: false, reason: 'Test environment' })
}))

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}))

// Mock formidable
jest.mock('formidable', () => {
  return jest.fn(() => ({
    parse: jest.fn()
  }))
})

const mockProcessInMemory = require('@/lib/document-processor').processInMemory
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>
const mockFormidable = formidable as jest.MockedFunction<typeof formidable>

// Test user for authenticated requests
const testUser = {
  id: 'test-user-123',
  email: 'test@example.com'
}

// Mock PDF buffer (minimal PDF structure)
const mockPDFBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n trailer<</Size 4/Root 1 0 R>>startxref 190 %%EOF')

describe('/api/process-pdf-memory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set default environment variables
    process.env.PDF_MAX_BYTES = '8388608' // 8MB
    process.env.USE_CANVAS = 'false'
    
    // Default successful processing mock
    mockProcessInMemory.mockResolvedValue({
      requestId: 'test-req-123',
      document: {
        originalFilename: 'test.pdf',
        pageCount: 1,
        chunkCount: 5,
        analysis: { content: 'Test analysis' }
      },
      metadata: {
        originalFilename: 'test.pdf',
        pageCount: 1,
        chunkCount: 5,
        userId: testUser.id
      }
    })
    
    // Default file read mock
    mockReadFile.mockResolvedValue(mockPDFBuffer)
  })

  describe('Method validation', () => {
    it('should return 405 for non-POST requests', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET'
      })
      
      // Add user to mock authenticated request
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(405)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method Not Allowed'
      })
    })
  })

  describe('Content-Length size validation', () => {
    it('should return 413 when Content-Length exceeds PDF_MAX_BYTES', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data',
          'content-length': '10485760' // 10MB > 8MB limit
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(413)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'E_SIZE_LIMIT',
        message: expect.stringContaining('10.0MB exceeds 8MB limit')
      })
    })

    it('should proceed when Content-Length is within limit', async () => {
      // Setup successful formidable mock
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/test.pdf',
              originalFilename: 'test.pdf',
              mimetype: 'application/pdf',
              size: 1024000 // 1MB
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data',
          'content-length': '1048576' // 1MB < 8MB limit
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('Content-Type validation', () => {
    it('should return 415 for non-multipart requests', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(415)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'E_UNSUPPORTED_TYPE',
        message: 'Content-Type must be multipart/form-data'
      })
    })
  })

  describe('Formidable size handling', () => {
    it('should return 413 on formidable ETOOBIG error', async () => {
      const mockForm = {
        parse: jest.fn((req, callback) => {
          const error = new Error('File too large')
          ;(error as any).code = 'ETOOBIG'
          callback(error)
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(413)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'E_SIZE_LIMIT',
        message: expect.stringContaining('exceeds 8MB limit')
      })
    })
  })

  describe('File validation', () => {
    it('should return 400 when no file is uploaded', async () => {
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {}) // No files
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(400)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'E_NO_FILE',
        message: 'No file uploaded'
      })
    })

    it('should return 415 for non-PDF files', async () => {
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/test.png',
              originalFilename: 'test.png',
              mimetype: 'image/png',
              size: 1024
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(415)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'E_UNSUPPORTED_TYPE',
        message: expect.stringContaining('must be a PDF')
      })
    })

    it('should accept PDF files with .pdf extension and empty mimetype', async () => {
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/test.pdf',
              originalFilename: 'test.pdf',
              mimetype: '', // Empty mimetype
              size: 1024
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('Processing error handling', () => {
    beforeEach(() => {
      // Setup valid file upload for processing tests
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/test.pdf',
              originalFilename: 'test.pdf',
              mimetype: 'application/pdf',
              size: 1024
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)
    })

    it('should return 422 for password-protected PDFs', async () => {
      mockProcessInMemory.mockRejectedValue(new Error('PDF is password-protected'))

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'PDF_UNREADABLE',
        message: 'PDF is password-protected or encrypted'
      })
    })

    it('should return 422 for PDFs with no extractable text', async () => {
      mockProcessInMemory.mockRejectedValue(new Error('No extractable text in PDF'))

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'NO_PDF_TEXT',
        message: 'PDF contains no readable text (likely image-only)'
      })
    })

    it('should return 422 for processing timeouts', async () => {
      mockProcessInMemory.mockRejectedValue(new Error('Processing timed out after 10 seconds'))

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'PDF_PARSE_TIMEOUT',
        message: 'PDF processing timed out'
      })
    })

    it('should return 422 for corrupt PDFs', async () => {
      mockProcessInMemory.mockRejectedValue(new Error('PDF file is corrupted'))

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(422)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'PDF_UNREADABLE',
        message: 'PDF file is corrupted or invalid'
      })
    })

    it('should return 500 for unexpected processing errors', async () => {
      mockProcessInMemory.mockRejectedValue(new Error('Unexpected database error'))

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(500)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        code: 'PROCESSING_ERROR',
        message: 'Unexpected database error'
      })
    })
  })

  describe('Successful processing', () => {
    it('should return 200 with processed document data', async () => {
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/valid-document.pdf',
              originalFilename: 'valid-document.pdf',
              mimetype: 'application/pdf',
              size: 1048576 // 1MB
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const expectedResult = {
        requestId: 'test-req-456',
        document: {
          originalFilename: 'valid-document.pdf',
          pageCount: 5,
          chunkCount: 25,
          analysis: { content: 'Comprehensive analysis of financial document' }
        },
        metadata: {
          originalFilename: 'valid-document.pdf',
          pageCount: 5,
          chunkCount: 25,
          userId: testUser.id
        }
      }

      mockProcessInMemory.mockResolvedValue(expectedResult)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data).toMatchObject({
        requestId: expect.any(String),
        document: expectedResult.document,
        metadata: expectedResult.metadata,
        processingTimeMs: expect.any(Number)
      })
      expect(data.processingTimeMs).toBeGreaterThanOrEqual(0)
      expect(data.requestId).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/)
    })
  })

  describe('Canvas handling', () => {
    it('should gracefully handle canvas loader failures', async () => {
      // Set canvas to enabled to test the loader path
      process.env.USE_CANVAS = 'true'

      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/test.pdf',
              originalFilename: 'test.pdf',
              mimetype: 'application/pdf',
              size: 1024
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      // Should still succeed even if canvas loading fails
      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('RequestId consistency', () => {
    it('should include requestId in all error responses', async () => {
      // Test with Content-Length error
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data',
          'content-length': '20971520' // 20MB > 8MB limit
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(413)
      const data = JSON.parse(res._getData())
      expect(data.requestId).toBeDefined()
      expect(typeof data.requestId).toBe('string')
      expect(data.requestId).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/)
    })

    it('should include requestId in success responses', async () => {
      const mockForm = {
        parse: jest.fn((req, callback) => {
          callback(null, {}, {
            file: {
              filepath: '/tmp/test.pdf',
              originalFilename: 'test.pdf',
              mimetype: 'application/pdf',
              size: 1024
            }
          })
        })
      }
      mockFormidable.mockReturnValue(mockForm as any)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      })
      
      ;(req as any).user = testUser

      await processMemoryHandler(req as any, res)

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.requestId).toBeDefined()
      expect(typeof data.requestId).toBe('string')
      expect(data.requestId).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/)
    })
  })
})