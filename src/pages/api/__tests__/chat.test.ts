import { createMocks } from 'node-mocks-http'
import handler from '../chat'
import { withAuth } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'

jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((h: any) => (req: any, res: any) => {
    req.user = { id: 'tester' }
    return h(req, res)
  }),
  withRateLimit: jest.fn(() => (h: any) => h)
}))

jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(),
  fixResponseFormat: jest.fn()
}))

describe('/api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
  })

  it('returns 200 with content and requestId header', async () => {
    ;(createChatCompletion as jest.Mock).mockResolvedValue({
      content: 'hello world',
      model: 'gpt-4o',
      usage: {}
    })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }] }
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBe('hello world')
    expect(res.getHeader('x-request-id')).toBeDefined()
  })

  it('rejects empty prompt with 400', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [] }
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(400)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('EMPTY_INPUT')
    expect(data.requestId).toBeDefined()
  })

  it('returns 500 when OpenAI key missing', async () => {
    delete process.env.OPENAI_API_KEY

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }] }
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(500)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('OPENAI_KEY_MISSING')
  })

  it('handles upstream timeout with 503', async () => {
    ;(createChatCompletion as jest.Mock).mockImplementation(() => {
      const err = new Error('timeout') as any
      err.name = 'AbortError'
      throw err
    })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }] }
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(503)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('UPSTREAM_TIMEOUT')
  })

  it('returns 502 when cascade fails', async () => {
    ;(createChatCompletion as jest.Mock)
      .mockResolvedValueOnce({ content: '', model: 'gpt-4o', usage: {} })
      .mockRejectedValue(new Error('fail'))

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }] }
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(502)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('MODEL_CASCADE_FAILED')
    expect(data.requestId).toBeDefined()
  })
})
