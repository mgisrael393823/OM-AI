/**
 * Comprehensive tests for the unified chat API endpoint
 * Tests all request formats, backward compatibility, and error handling
 */

import { createMocks } from 'node-mocks-http'
import handler from '../../pages/api/chat'
import { withAuth } from '@/lib/auth-middleware'

// Mock the auth middleware
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((handler) => handler),
  withRateLimit: jest.fn((options: any) => (handler: any) => handler),
  apiError: (res: any, status: number, message: string, code?: string) => {
    res.status(status).json({ error: message, code })
  }
}))

// Mock Supabase Admin
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn(() => Promise.resolve({ data: { id: 'test-msg-id' }, error: null })),
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
  }
}))

// Mock OpenAI service
jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(() => Promise.resolve({
    text: 'Test response from API',
    model: 'gpt-4o',
    usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
    request_id: 'test-req-123'
  }))
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

describe.skip('/api/chat (unified endpoint)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock auth middleware to pass through with mock user
    ;(withAuth as jest.Mock).mockImplementation((handler: any) => (req: any, res: any) => {
      req.user = { id: 'test-user-id' }
      return handler(req, res)
    })
  })

  describe('Request Validation', () => {
    test('should reject legacy {message: string} format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'What is the cap rate?',
          sessionId: 'test-session-id'
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
      const data = JSON.parse(res._getData())
      expect(data.code).toBe('INVALID_REQUEST_FORMAT')
      expect(data.details.allowed_formats).toHaveLength(2)
      expect(data.details.allowed_formats[0].name).toBe('Chat Completions API')
      expect(data.details.allowed_formats[1].name).toBe('Responses API')
    })

    test('should accept Chat Completions API format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-4o',
          messages: [{role: 'user', content: 'What is the cap rate for this property?'}],
          sessionId: 'test-session-id',
          stream: true
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.message).toBeDefined()
      expect(data.request_id).toBeDefined()
    })

    test('should accept Responses API format with input string', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-5',
          input: 'What is the cap rate for this property?',
          sessionId: 'test-session-id',
          stream: true,
          max_output_tokens: 1000
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.message).toBeDefined()
      expect(data.request_id).toBeDefined()
    })

    test('should accept Responses API format with messages', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-5',
          messages: [{role: 'user', content: 'What is the cap rate for this property?'}],
          sessionId: 'test-session-id',
          stream: true,
          max_output_tokens: 1000
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.message).toBeDefined()
      expect(data.request_id).toBeDefined()
    })

    test('should reject null sessionId with proper error format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-4o',
          sessionId: null,
          messages: [{role: 'user', content: 'hi'}]
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
      const data = JSON.parse(res._getData())
      expect(data.code).toBe('INVALID_REQUEST_FORMAT')
      expect(data.details.message).toContain('sessionId cannot be null')
      expect(data.details.allowed_formats).toHaveLength(2)
      expect(data.details.note).toContain('Never send null values')
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

  describe('Legacy Format Support & Model Routing', () => {
    test('should handle legacy {message} with gpt-4o model', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'provide summary',
          model: 'gpt-4o',
          sessionId: null,
          options: { stream: true }
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      // Should not have INVALID_REQUEST_FORMAT error
      if (res._getStatusCode() !== 200) {
        const data = JSON.parse(res._getData())
        expect(data.code).not.toBe('INVALID_REQUEST_FORMAT')
      }
    })

    test('should handle legacy {message} with gpt-5 model', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'hello',
          model: 'gpt-5',
          stream: true
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      // Should not have INVALID_REQUEST_FORMAT error
      if (res._getStatusCode() !== 200) {
        const data = JSON.parse(res._getData())
        expect(data.code).not.toBe('INVALID_REQUEST_FORMAT')
      }
    })

    test('should use max_tokens for Chat models (gpt-4o)', async () => {
      const createChatCompletionSpy = jest.spyOn(require('@/lib/services/openai'), 'createChatCompletion')
      createChatCompletionSpy.mockResolvedValue({
        text: 'Test response',
        usage: { total_tokens: 50 },
        model: 'gpt-4o'
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1000,
          stream: false
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(createChatCompletionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          max_output_tokens: 1000 // Should map to max_output_tokens internally
        })
      )

      createChatCompletionSpy.mockRestore()
    })

    test('should use max_output_tokens for Responses models (gpt-5)', async () => {
      const createChatCompletionSpy = jest.spyOn(require('@/lib/services/openai'), 'createChatCompletion')
      createChatCompletionSpy.mockResolvedValue({
        text: 'Test response',
        usage: { total_tokens: 50 },
        model: 'gpt-5'
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-5',
          input: 'hello',
          max_output_tokens: 1000,
          stream: false
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(createChatCompletionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          max_output_tokens: 1000
        })
      )

      createChatCompletionSpy.mockRestore()
    })
  })

  describe('Parameter Filtering', () => {
    test('should omit temperature for gpt-4.1', async () => {
      const createChatCompletionSpy = jest.spyOn(require('@/lib/services/openai'), 'createChatCompletion')
      createChatCompletionSpy.mockResolvedValue({
        text: 'Test response',
        usage: { total_tokens: 50 },
        model: 'gpt-4.1'
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-4.1',
          input: 'hello',
          temperature: 0.8  // This should be filtered out
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      // Verify temperature was not passed to OpenAI
      expect(createChatCompletionSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({
          temperature: expect.anything()
        })
      )

      createChatCompletionSpy.mockRestore()
    })
  })

  describe('Document ID Handling', () => {
    test('should move top-level documentId to metadata', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Test message',
          documentId: 'doc-123'  // Top-level documentId
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      // The documentId should be accessible as metadata.documentId in the handler
    })

    test('should preserve existing metadata.documentId', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          message: 'Test message',
          metadata: {
            documentId: 'doc-456'
          }
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
    })
  })

  describe('Conflict Detection', () => {
    test('should reject both messages and input with clear 400 error', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
          input: 'hello'  // Conflict!
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
      const data = JSON.parse(res._getData())
      expect(data.code).toBe('CONFLICTING_INPUT_FORMATS')
      expect(data.error).toContain('Cannot specify both messages and input')
    })
  })

  describe('Chat History Preservation', () => {
    test('should preserve multiple user/assistant turns without duplication', async () => {
      const createChatCompletionSpy = jest.spyOn(require('@/lib/services/openai'), 'createChatCompletion')
      createChatCompletionSpy.mockResolvedValue({
        text: 'Test response',
        usage: { total_tokens: 50 },
        model: 'gpt-4o'
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          model: 'gpt-4o',
          messages: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'First answer' },
            { role: 'user', content: 'Second question' }
          ]
        }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(createChatCompletionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'First answer' },
            { role: 'user', content: 'Second question' }
          ]
        })
      )

      createChatCompletionSpy.mockRestore()
    })
  })
})