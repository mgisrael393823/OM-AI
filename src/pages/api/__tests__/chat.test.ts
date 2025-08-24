import { createMocks } from 'node-mocks-http'
import handler from '../chat'
import { createChatCompletion } from '@/lib/services/openai'

// Mock TextEncoder
global.TextEncoder = require('util').TextEncoder

jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((h: any) => h),
  withRateLimit: jest.fn(() => (h: any) => h)
}))

jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(),
  fixResponseFormat: jest.fn()
}))

jest.mock('@/lib/kv-store', () => ({
  getStatus: jest.fn(),
  getContext: jest.fn(),
  setContext: jest.fn(),
  getItem: jest.fn(),
  setItem: jest.fn()
}))

jest.mock('@/lib/rag/retriever', () => ({
  retrieveTopK: jest.fn()
}))

jest.mock('@/lib/rag/augment', () => ({
  augmentMessagesWithContext: jest.fn((chunks: any, messages: any) => ({
    chat: messages,
    responses: messages
  }))
}))

describe('Chat API gating', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('missing documentId returns 424', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { origin: 'https://example.com' },
      body: { messages: [{ role: 'user', content: 'hi' }], stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(424)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('CONTEXT_UNAVAILABLE')
    const headers = res._getHeaders()
    expect(headers['x-request-id']).toBeDefined()
    expect(headers['content-type']).toContain('application/json')
    expect(headers['access-control-allow-origin']).toBe('https://example.com')
  })

  test('processing status returns 202 with Retry-After', async () => {
    const { getStatus } = require('@/lib/kv-store')
    getStatus.mockResolvedValue({ status: 'processing', parts: 0 })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], metadata: { documentId: 'mem-1' }, stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(202)
    expect(res._getHeaders()['retry-after']).toBeDefined()
  })

  test('zero chunks returns 424', async () => {
    const { getStatus } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    getStatus.mockResolvedValue({ status: 'ready', parts: 5 })
    retrieveTopK.mockResolvedValue([])

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], metadata: { documentId: 'mem-1' }, stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(424)
  })

  test('empty model content returns safe fallback message', async () => {
    const { getStatus } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    getStatus.mockResolvedValue({ status: 'ready', parts: 5 })
    retrieveTopK.mockResolvedValue([{ content: 'chunk', page_number: 1 }])
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: '' })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], metadata: { documentId: 'mem-1' }, stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBe("I couldn't generate a response. Please try rephrasing your question or ensure a document is uploaded.")
  })

  test('positive path echoes request id', async () => {
    const { getStatus } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    getStatus.mockResolvedValue({ status: 'ready', parts: 5 })
    retrieveTopK.mockResolvedValue([{ content: 'chunk', page_number: 1 }])
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: 'hello', model: 'gpt', usage: {} })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], metadata: { documentId: 'mem-1' }, stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    expect(res._getHeaders()['x-request-id']).toBeDefined()
  })
})
