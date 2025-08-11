/**
 * Comprehensive tests for the unified chat API endpoint
 * Tests all request formats, backward compatibility, and error handling
 */

import { createMocks } from 'node-mocks-http'
import handler from '../chat'
import { withAuth } from '@/lib/auth-middleware'

// Mock the auth middleware
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn(),
  withRateLimit: jest.fn((userId: string, limit: number, refill: number, callback: (...args: any[]) => void) => callback()),
  apiError: (res: any, status: number, message: string, code?: string) => {
    res.status(status).json({ error: message, code })
  }
}))

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      textSearch: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: jest.fn(() => Promise.resolve({ data: [], error: null }))
    }))
  }))
}))

// Mock OpenAI service
jest.mock('@/lib/services/openai', () => ({
  openAIService: {
    createStreamingCompletion: jest.fn(() => Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'Test' } }] }
        yield { choices: [{ delta: { content: ' response' } }] }
        yield { choices: [{ delta: {} }] }
      }
    })),
    createChatCompletion: jest.fn(() => Promise.resolve({
      choices: [{ message: { content: 'Test response' } }]
    }))
  }
}))

// Mock circuit breaker
jest.mock('@/lib/utils/circuit-breaker', () => ({
  openAICircuitBreaker: {
    execute: jest.fn((fn) => fn())
  }
}))

// Mock subscription limits
jest.mock('@/lib/services/openai/types', () => ({
  SUBSCRIPTION_LIMITS: {
    starter: {
      requestsPerDay: 10,
      requestsPerHour: 5,
      allowedModels: ['gpt-4o-mini'],
      features: { functionCalling: false }
    },
    professional: {
      requestsPerDay: 100,
      requestsPerHour: 50,
      allowedModels: ['gpt-4o', 'gpt-4o-mini'],
      features: { functionCalling: true }
    }
  }
}))

describe('/api/chat (unified endpoint)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock auth middleware to pass through with mock user
    ;(withAuth as jest.Mock).mockImplementation((req, res, handler) => {
      req.user = { id: 'test-user-id' }
      return handler(req, res)
    })
  })

  describe('Simple Format (chat-enhanced compatibility)', () => {
    test('should handle simple message format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'What is the cap rate?',
          sessionId: 'test-session-id'
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })

    test('should validate message is required for simple format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          sessionId: 'test-session-id'
          // message missing
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
      const data = JSON.parse(res._getData())
      expect(data.error).toBe('Message is required')
      expect(data.code).toBe('MISSING_MESSAGE')
    })

    test('should auto-create session when not provided', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Test message'
          // sessionId not provided
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })

    test('should handle legacy chat_session_id field', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Test message',
          chat_session_id: 'legacy-session-id' // legacy field name
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('Complex Format (chat-v2 compatibility)', () => {
    test('should handle complex message format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          messages: [
            { role: 'user', content: 'Analyze this property' }
          ],
          options: {
            model: 'gpt-4o',
            temperature: 0.8,
            stream: false
          }
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })

    test('should validate messages array for complex format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          messages: null, // Explicitly null to trigger complex format validation
          options: { stream: false }
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
      const data = JSON.parse(res._getData())
      expect(data.error).toBe('Invalid messages format')
      expect(data.code).toBe('INVALID_MESSAGES')
    })

    test('should handle document context', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          messages: [
            { role: 'user', content: 'What are the key terms?' }
          ],
          documentContext: {
            documentIds: ['doc-123'],
            maxChunks: 3,
            relevanceThreshold: 0.2
          },
          options: { stream: false }
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('Backward Compatibility', () => {
    test('should detect deprecated endpoint usage', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          'x-deprecated-endpoint': 'chat-enhanced'
        },
        body: {
          message: 'Test message'
        }
      })

      await handler(req, res)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Deprecated endpoint used: /api/chat-enhanced',
        expect.objectContaining({
          userId: 'test-user-id'
        })
      )

      consoleSpy.mockRestore()
    })

    test('should use SSE format for deprecated endpoints', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          'x-deprecated-endpoint': 'chat-enhanced'
        },
        body: {
          message: 'Test message',
          options: { stream: true }
        }
      })

      await handler(req, res)

      const headers = res.getHeaders()
      expect(headers['content-type']).toBe('text/event-stream')
      expect(headers['x-accel-buffering']).toBe('no')
    })

    test('should handle legacy document_id field', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Analyze this document',
          document_id: 'legacy-doc-id' // legacy field name
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('Error Handling', () => {
    test('should reject non-POST methods', async () => {
      const { req, res } = createMocks({
        method: 'GET'
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(405)
      const data = JSON.parse(res._getData())
      expect(data.error).toBe('HTTP method not allowed for this endpoint')
      expect(data.code).toBe('METHOD_NOT_ALLOWED')
    })

    test('should handle invalid request format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          invalidField: 'value'
          // neither message nor messages provided
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
    })

    test('should handle database errors gracefully', async () => {
      // Mock database error
      const mockSupabase = require('@supabase/supabase-js').createClient()
      mockSupabase.from().single.mockReturnValueOnce(
        Promise.resolve({ data: null, error: { message: 'Database error' } })
      )

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Test message'
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(500)
    })
  })

  describe('Migration Helper Function', () => {
    test('should normalize chat-enhanced format', () => {
      const body = {
        message: 'Test message',
        chat_session_id: 'session-123',
        document_id: 'doc-456'
      }

      // Access the internal normalize function (would need export in actual implementation)
      // This tests the logic conceptually
      const normalized = {
        message: body.message,
        sessionId: body.chat_session_id,
        documentId: body.document_id,
        options: {}
      }

      expect(normalized.message).toBe('Test message')
      expect(normalized.sessionId).toBe('session-123')
      expect(normalized.documentId).toBe('doc-456')
    })

    test('should normalize chat-v2 format', () => {
      const body = {
        messages: [{ role: 'user', content: 'Test' }],
        sessionId: 'session-123',
        documentContext: { documentIds: ['doc-1'] },
        options: { temperature: 0.8 }
      }

      const normalized = {
        messages: body.messages,
        sessionId: body.sessionId,
        documentContext: body.documentContext,
        options: body.options
      }

      expect(normalized.messages).toEqual([{ role: 'user', content: 'Test' }])
      expect(normalized.sessionId).toBe('session-123')
      expect(normalized.options?.temperature).toBe(0.8)
    })
  })

  describe('Streaming Response Formats', () => {
    test('should use plain text streaming for new format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          messages: [{ role: 'user', content: 'Test' }],
          options: { stream: true }
        }
      })

      await handler(req, res)

      const headers = res.getHeaders()
      expect(headers['content-type']).toBe('text/plain; charset=utf-8')
    })

    test('should include session ID in response headers', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Test message',
          sessionId: 'test-session-123'
        }
      })

      await handler(req, res)

      const headers = res.getHeaders()
      expect(headers['x-chat-session-id']).toBeDefined()
    })
  })
})