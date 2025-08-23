/**
 * Tests for chat endpoint CORS and headers compliance
 */

import { createMocks } from 'node-mocks-http'
import handler from '../chat'
import { createChatCompletion } from '@/lib/services/openai'

// Mock TextEncoder for Node.js test environment
global.TextEncoder = require('util').TextEncoder

// Mock dependencies
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((handler) => handler),
  withRateLimit: jest.fn((options: any) => (handler: any) => handler)
}))

jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(),
  fixResponseFormat: jest.fn()
}))

jest.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn(() => Promise.resolve({ data: { id: 'test-msg-id' }, error: null })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null }))
    }))
  }))
}))

jest.mock('@/lib/rag/retriever', () => ({
  retrieveTopK: jest.fn(() => Promise.resolve([]))
}))

jest.mock('@/lib/rag/augment', () => ({
  augmentMessagesWithContext: jest.fn((messages) => messages)
}))

jest.mock('@/lib/kv-store', () => ({
  getContext: jest.fn(() => Promise.resolve(null)),
  setContext: jest.fn(() => Promise.resolve(true)),
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve(true))
}))

describe('Chat API Headers and CORS', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('OPTIONS preflight', () => {
    test('returns complete CORS headers with origin', async () => {
      const { req, res } = createMocks({ 
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' }
      })

      // Mock user for auth middleware
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      
      const headers = res._getHeaders()
      expect(headers['access-control-allow-origin']).toBe('https://example.com')
      expect(headers['access-control-allow-headers']).toBe('Content-Type, X-Request-ID, X-Correlation-ID, Authorization')
      expect(headers['access-control-allow-methods']).toBe('POST, OPTIONS')
      expect(headers['access-control-max-age']).toBe('86400')
      expect(headers['vary']).toBe('Origin')
    })

    test('uses wildcard when no origin provided', async () => {
      const { req, res } = createMocks({ method: 'OPTIONS' })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      expect(res._getHeaders()['access-control-allow-origin']).toBe('*')
    })
  })

  describe('Method validation', () => {
    test('405 includes Allow header and CORS', async () => {
      const { req, res } = createMocks({ 
        method: 'DELETE',
        headers: { origin: 'https://app.example.com' }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(405)
      
      const headers = res._getHeaders()
      expect(headers['allow']).toBe('POST, OPTIONS')
      expect(headers['content-type']).toContain('application/json')
      expect(headers['x-request-id']).toBeDefined()
      expect(headers['access-control-allow-origin']).toBe('https://app.example.com')
      expect(headers['access-control-allow-methods']).toBe('POST, OPTIONS')
      expect(headers['vary']).toBe('Origin')
      
      const data = JSON.parse(res._getData())
      expect(data.code).toBe('METHOD_NOT_ALLOWED')
      expect(data.requestId).toBeDefined()
    })

    test('GET method returns 405 with proper headers', async () => {
      const { req, res } = createMocks({ method: 'GET' })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(405)
      expect(res._getHeaders()['allow']).toBe('POST, OPTIONS')
    })
  })

  describe('Error response headers', () => {
    test('all error paths include required headers', async () => {
      const testCases = [
        {
          name: '401 Unauthorized',
          setup: () => {
            ;(createChatCompletion as jest.Mock).mockRejectedValue({ status: 401 })
            return { body: { messages: [{ role: 'user', content: 'test' }] } }
          },
          expectedStatus: 401
        },
        {
          name: '429 Rate Limited',
          setup: () => {
            ;(createChatCompletion as jest.Mock).mockRejectedValue({ 
              status: 429,
              headers: { 'retry-after': '60' }
            })
            return { body: { messages: [{ role: 'user', content: 'test' }] } }
          },
          expectedStatus: 429
        },
        {
          name: '502 Upstream Error',
          setup: () => {
            ;(createChatCompletion as jest.Mock).mockRejectedValue({ status: 502 })
            return { body: { messages: [{ role: 'user', content: 'test' }] } }
          },
          expectedStatus: 502
        }
      ]
      
      for (const testCase of testCases) {
        jest.clearAllMocks()
        
        const requestData = testCase.setup()
        const { req, res } = createMocks({
          method: 'POST',
          headers: { origin: 'https://test.example.com' },
          ...requestData
        })
        ;(req as any).user = { id: 'test-user' }
        
        await handler(req as any, res as any)
        
        const headers = res._getHeaders()
        
        // Verify all required headers are present
        expect(headers['content-type']).toContain('application/json')
        expect(headers['x-request-id']).toBeDefined()
        expect(headers['access-control-allow-origin']).toBe('https://test.example.com')
        expect(headers['access-control-allow-headers']).toContain('Authorization')
        expect(headers['access-control-allow-methods']).toBe('POST, OPTIONS')
        expect(headers['vary']).toBe('Origin')
        
        // Verify response body
        const data = JSON.parse(res._getData())
        expect(data.requestId).toBeDefined()
        expect(data.code).toBeDefined()
        
        console.log(`✓ ${testCase.name}: status=${res._getStatusCode()}, code=${data.code}`)
      }
    })

    test('429 includes Retry-After header', async () => {
      ;(createChatCompletion as jest.Mock).mockRejectedValue({ 
        status: 429,
        headers: { 'retry-after': '60' }
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(429)
      expect(res._getHeaders()['retry-after']).toBeDefined()
    })
  })

  describe('X-Request-ID handling', () => {
    test('echoes provided X-Request-ID', async () => {
      ;(createChatCompletion as jest.Mock).mockResolvedValue({
        content: 'Test response',
        model: 'gpt-4o',
        usage: {}
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-request-id': 'client-provided-123' },
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      expect(res._getHeaders()['x-request-id']).toBe('client-provided-123')
    })

    test('generates requestId when none provided', async () => {
      ;(createChatCompletion as jest.Mock).mockResolvedValue({
        content: 'Test response',
        model: 'gpt-4o',
        usage: {}
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      const requestId = res._getHeaders()['x-request-id']
      expect(requestId).toBeDefined()
      expect(typeof requestId).toBe('string')
      expect(requestId).toMatch(/^chat_/)
    })

    test('echoes X-Correlation-ID as X-Request-ID', async () => {
      ;(createChatCompletion as jest.Mock).mockResolvedValue({
        content: 'Test response',
        model: 'gpt-4o',
        usage: {}
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-correlation-id': 'correlation-456' },
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      expect(res._getHeaders()['x-request-id']).toBe('correlation-456')
    })
  })

  describe('SAFE_FALLBACK_MESSAGE', () => {
    test('uses fallback when AI returns empty content', async () => {
      ;(createChatCompletion as jest.Mock).mockResolvedValue({
        content: '', // Empty content
        model: 'gpt-4o',
        usage: {}
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.message).toBe("I couldn't generate a response. Please try rephrasing your question or ensure a document is uploaded.")
    })

    test('uses fallback when AI content is only whitespace', async () => {
      ;(createChatCompletion as jest.Mock).mockResolvedValue({
        content: '   \n  \t  ', // Whitespace only
        model: 'gpt-4o',
        usage: {}
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.message).toBe("I couldn't generate a response. Please try rephrasing your question or ensure a document is uploaded.")
    })

    test('preserves valid AI content', async () => {
      ;(createChatCompletion as jest.Mock).mockResolvedValue({
        content: 'This is a valid response from the AI.',
        model: 'gpt-4o',
        usage: {}
      })
      
      const { req, res } = createMocks({
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'test' }] }
      })
      ;(req as any).user = { id: 'test-user' }
      
      await handler(req as any, res as any)
      
      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.message).toBe('This is a valid response from the AI.')
    })
  })
})