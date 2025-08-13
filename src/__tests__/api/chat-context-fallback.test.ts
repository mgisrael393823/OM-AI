import { createMocks } from 'node-mocks-http'
import handler from '../../pages/api/chat'
import { withAuth } from '@/lib/auth-middleware'

// Mock the auth middleware to inject a user
jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((handler: any) => (req: any, res: any) => {
    req.user = { id: 'test-user-id' }
    return handler(req, res)
  }),
  withRateLimit: jest.fn(() => (handler: any) => handler),
  apiError: (res: any, status: number, message: string, code?: string) => {
    res.status(status).json({ error: message, code })
  }
}))

// Mock Supabase admin client used in handler
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn(() => Promise.resolve({ data: { id: 'msg-id' }, error: null })),
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

// Mock retrieveTopK to return no chunks
jest.mock('@/lib/rag/retriever', () => ({
  retrieveTopK: jest.fn(() => Promise.resolve([]))
}))

// Mock OpenAI service
jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(() =>
    Promise.resolve({
      content: 'Test response from API',
      model: 'gpt-4o',
      usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
      request_id: 'test-req-123'
    })
  )
}))

describe('chat API document context fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(withAuth as jest.Mock).mockImplementation((handler: any) => (req: any, res: any) => {
      req.user = { id: 'test-user-id' }
      return handler(req, res)
    })
  })

  it('continues without error when document context is missing', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: { documentId: 'missing-doc' }
      }
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBeDefined()
  })
})

