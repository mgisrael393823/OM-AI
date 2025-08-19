/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/chat/fallback-text'
import { createChatCompletion } from '@/lib/services/openai'
import { withAuth } from '@/lib/auth-middleware'

// Mock auth middleware and rate limiter
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((h: any) => (req: any, res: any) => {
    req.user = { id: 'test-user-id' }
    return h(req, res)
  }),
  withRateLimit: jest.fn(() => (h: any) => h),
  apiError: (res: any, status: number, message: string, code?: string) => {
    res.status(status).json({ error: message, code })
  }
}))

// Mock Supabase admin client
jest.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: () => Promise.resolve({ data: { id: 'msg-id' }, error: null })
    })
  })
}))

// Mock KV store
jest.mock('@/lib/kv-store', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve())
}))

// Mock RAG utilities
jest.mock('@/lib/rag/retriever', () => ({
  retrieveTopK: jest.fn(() => Promise.resolve([]))
}))

jest.mock('@/lib/rag/augment', () => ({
  augmentMessagesWithContext: jest.fn((_c: any, m: any) => ({ chat: m, responses: m }))
}))

// Mock logging
jest.mock('@/lib/log', () => ({
  structuredLog: jest.fn(),
  generateRequestId: jest.fn(() => 'test-request-id')
}))

jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(async () => ({
    content: 'fallback response',
    model: 'gpt-mock',
    usage: {}
  }))
}))

describe('Fallback safety integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(withAuth as jest.Mock).mockImplementation((h: any) => (req: any, res: any) => {
      req.user = { id: 'test-user-id' }
      return h(req, res)
    })
  })

  it('handles tool_choice without tools gracefully', async () => {
    const payload = {
      messages: [{ role: 'user', content: 'test' }],
      tool_choice: 'auto'
    }

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/chat/fallback-text',
      body: payload
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBeDefined()
    expect(data.message.length).toBeGreaterThan(0)

    const callPayload = (createChatCompletion as jest.Mock).mock.calls[0][0]
    expect(callPayload.tool_choice).toBeUndefined()
    expect(callPayload.tools).toBeUndefined()
  })

  it('sanitizes undefined values in payload', async () => {
    const payload = {
      messages: [{ role: 'user', content: 'test' }],
      temperature: undefined,
      some_undefined_field: undefined,
      stream: undefined
    }

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/chat/fallback-text',
      body: payload
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(200)
    const callPayload = (createChatCompletion as jest.Mock).mock.calls[0][0]
    
    // These should be removed by sanitization (undefined values)
    expect('temperature' in callPayload).toBe(false)
    expect('some_undefined_field' in callPayload).toBe(false)
    // Stream is explicitly set to false by fallback logic
    expect(callPayload.stream).toBe(false)
  })

  it('handles empty OpenAI response gracefully', async () => {
    ;(createChatCompletion as jest.Mock).mockResolvedValueOnce({
      content: '',
      model: 'gpt-mock',
      usage: {}
    })

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        messages: [{ role: 'user', content: 'test' }]
      }
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.source).toBe('fallback_default')
    expect(data.message).toContain('need more context')
  })
})