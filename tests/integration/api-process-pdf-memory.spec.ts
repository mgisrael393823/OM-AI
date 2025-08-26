import { createMocks } from 'node-mocks-http'
import processMemoryHandler from '@/pages/api/process-pdf-memory'
import type { NextApiResponse } from 'next'

// Mock authentication middleware
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: unknown) => handler
}))

// Mock document processor
jest.mock('@/lib/document-processor', () => ({
  processInMemory: jest.fn().mockResolvedValue({
    success: true,
    document: {
      originalFilename: 'test.pdf',
      pageCount: 1,
      chunkCount: 5,
      analysis: { content: 'test analysis' }
    },
    metadata: {
      originalFilename: 'test.pdf',
      pageCount: 1,
      chunkCount: 5,
      userId: 'test-user-id'
    }
  })
}))

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue(Buffer.from('fake pdf content'))
  }
}))

// Mock formidable
const mockFormidable = {
  parseBuffer: jest.fn(),
  parse: jest.fn()
}

jest.mock('formidable', () => {
  return jest.fn().mockImplementation(() => mockFormidable)
})

describe('/api/process-pdf-memory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset environment variables
    process.env.MAX_UPLOAD_MB = '8'
  })

  it('should reject files exceeding size limit via Content-Length', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': '10485760' // 10MB (exceeds 8MB limit)
      }
    })

    // Mock authenticated user
    ;(req as unknown as { user: { id: string } }).user = { id: 'test-user-id' }

    await processMemoryHandler(req as unknown as Parameters<typeof processMemoryHandler>[0], res as NextApiResponse)

    expect(res._getStatusCode()).toBe(413)
    const responseData = JSON.parse(res._getData())
    expect(responseData).toMatchObject({
      code: 'E_SIZE_LIMIT',
      message: expect.stringContaining('exceeds 8MB limit'),
      limitBytes: 8 * 1024 * 1024,
      receivedBytes: 10485760
    })
    expect(responseData.requestId).toBeDefined()
  })

  it('should reject files exceeding size limit via formidable ETOOBIG', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': '7340032' // 7MB (under limit)
      }
    })

    // Mock authenticated user
    ;(req as unknown as { user: { id: string } }).user = { id: 'test-user-id' }

    // Mock formidable to throw ETOOBIG error
    mockFormidable.parse.mockImplementation((req: unknown, callback: (err: Error | null, fields?: unknown, files?: unknown) => void) => {
      const error = new Error('File too large')
      ;(error as Error & { code: string }).code = 'ETOOBIG'
      callback(error)
    })

    await processMemoryHandler(req as unknown as Parameters<typeof processMemoryHandler>[0], res as NextApiResponse)

    expect(res._getStatusCode()).toBe(413)
    const responseData = JSON.parse(res._getData())
    expect(responseData).toMatchObject({
      code: 'E_SIZE_LIMIT',
      message: 'File exceeds 8MB limit',
      limitBytes: 8 * 1024 * 1024,
      receivedBytes: expect.any(Number)
    })
    expect(responseData.requestId).toBeDefined()
  })

  it('should process files under the size limit successfully', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': '4718592' // 4.5MB (under 8MB limit)
      }
    })

    // Mock authenticated user
    ;(req as unknown as { user: { id: string } }).user = { id: 'test-user-id' }

    // Mock successful formidable parsing
    mockFormidable.parse.mockImplementation((req: unknown, callback: (err: Error | null, fields?: unknown, files?: unknown) => void) => {
      const files = {
        file: {
          filepath: '/tmp/upload_123',
          originalFilename: 'test.pdf',
          size: 4718592,
          mimetype: 'application/pdf'
        }
      }
      callback(null, {}, files)
    })

    await processMemoryHandler(req as unknown as Parameters<typeof processMemoryHandler>[0], res as NextApiResponse)

    expect(res._getStatusCode()).toBe(200)
    const responseData = JSON.parse(res._getData())
    expect(responseData).toMatchObject({
      success: true,
      document: {
        originalFilename: 'test.pdf',
        pageCount: 1,
        chunkCount: 5
      },
      processingTimeMs: expect.any(Number)
    })
    expect(responseData.requestId).toBeDefined()
  })

  it('should respect custom MAX_UPLOAD_MB environment variable', async () => {
    // Set custom limit
    process.env.MAX_UPLOAD_MB = '5'

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': '6291456' // 6MB (exceeds 5MB limit)
      }
    })

    // Mock authenticated user
    ;(req as unknown as { user: { id: string } }).user = { id: 'test-user-id' }

    await processMemoryHandler(req as unknown as Parameters<typeof processMemoryHandler>[0], res as NextApiResponse)

    expect(res._getStatusCode()).toBe(413)
    const responseData = JSON.parse(res._getData())
    expect(responseData).toMatchObject({
      code: 'E_SIZE_LIMIT',
      message: expect.stringContaining('exceeds 5MB limit'),
      limitBytes: 5 * 1024 * 1024,
      receivedBytes: 6291456
    })
  })

  it('should reject non-POST requests', async () => {
    const { req, res } = createMocks({
      method: 'GET'
    })

    // Mock authenticated user
    ;(req as unknown as { user: { id: string } }).user = { id: 'test-user-id' }

    await processMemoryHandler(req as unknown as Parameters<typeof processMemoryHandler>[0], res as NextApiResponse)

    expect(res._getStatusCode()).toBe(405)
    const responseData = JSON.parse(res._getData())
    expect(responseData).toMatchObject({
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method Not Allowed'
    })
  })

  it('should reject invalid content type', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      }
    })

    // Mock authenticated user
    ;(req as unknown as { user: { id: string } }).user = { id: 'test-user-id' }

    await processMemoryHandler(req as unknown as Parameters<typeof processMemoryHandler>[0], res as NextApiResponse)

    expect(res._getStatusCode()).toBe(415)
    const responseData = JSON.parse(res._getData())
    expect(responseData).toMatchObject({
      code: 'E_UNSUPPORTED_TYPE',
      message: 'Content-Type must be multipart/form-data'
    })
  })
})