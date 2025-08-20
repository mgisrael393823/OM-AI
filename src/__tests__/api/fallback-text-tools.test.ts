import { createMocks } from 'node-mocks-http'
import handler from '../../pages/api/chat/fallback-text'
import { withAuth } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'

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

// Mock Supabase admin client used in handler
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

// Mock OpenAI service
jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(() => Promise.resolve({
    content: 'Fallback response text',
    model: 'gpt-4o',
    usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 }
  })),
  fixResponseFormat: jest.fn()
}))

const createChatCompletionMock = createChatCompletion as unknown as jest.Mock

describe('fallback-text endpoint tool sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(withAuth as jest.Mock).mockImplementation((h: any) => (req: any, res: any) => {
      req.user = { id: 'test-user-id' }
      return h(req, res)
    })
  })

  it('removes tool_choice when no tools are provided', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        tool_choice: 'auto'
      }
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    const payload = createChatCompletionMock.mock.calls[0][0]
    // When no tools present, tool_choice should not be in the payload
    expect(payload.tool_choice).toBeUndefined()
    expect(payload.tools).toBeUndefined()
    const data = JSON.parse(res._getData())
    expect(data.message).toBe('Fallback response text')
  })

  it('returns default message when OpenAI returns empty content', async () => {
    // Mock empty response from OpenAI
    createChatCompletionMock.mockResolvedValueOnce({
      content: '',
      model: 'gpt-4o',
      usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 }
    })

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        messages: [{ role: 'user', content: 'Hello' }]
      }
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBe("I understand your request but need more context. Could you please rephrase or provide more details?")
    expect(data.source).toBe('fallback_default')
  })

  it('ignores tools in request and creates clean text-only payload', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ type: 'function', function: { name: 'test' } }],
        tool_choice: 'auto'
      }
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    const payload = createChatCompletionMock.mock.calls[0][0]
    // Fallback endpoint creates clean text-only payloads - tools are not preserved
    expect(payload.tools).toBeUndefined()
    expect(payload.tool_choice).toBeUndefined()
    expect(payload.stream).toBe(false)
    const data = JSON.parse(res._getData())
    expect(data.message).toBe('Fallback response text')
  })
})