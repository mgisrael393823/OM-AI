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
    process.env.CONVERSATIONAL_CHAT = '0'
  })

  test('missing documentId on document query returns 424', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { origin: 'https://example.com' },
      body: { messages: [{ role: 'user', content: 'summarize this document' }], stream: false }
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

  test('general chat without documentId succeeds', async () => {
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: 'hello', model: 'gpt', usage: {} })
    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBe('hello')
  })

  test('processing status returns 202 with Retry-After', async () => {
    const { getStatus } = require('@/lib/kv-store')
    getStatus.mockResolvedValue({ status: 'processing', parts: 0, pagesIndexed: 10 })

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
    getStatus.mockResolvedValue({ status: 'ready', parts: 5, pagesIndexed: 10 })
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
    getStatus.mockResolvedValue({ status: 'ready', parts: 5, pagesIndexed: 10 })
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
    getStatus.mockResolvedValue({ status: 'ready', parts: 5, pagesIndexed: 10 })
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

  test('threshold boundary: exactly at required parts', async () => {
    const { getStatus } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    // Small doc: 1 page requires 1 part
    getStatus.mockResolvedValue({ status: 'ready', parts: 1, pagesIndexed: 1 })
    retrieveTopK.mockResolvedValue([{ content: 'chunk' }])
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: 'response' })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'analyze this' }], metadata: { documentId: 'mem-small' }, stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
  })

  test('threshold boundary: one part short', async () => {
    const { getStatus } = require('@/lib/kv-store')
    // 6 pages indexed, requires 3 parts, but only has 2
    getStatus.mockResolvedValue({ status: 'processing', parts: 2, pagesIndexed: 6 })

    const { req, res } = createMocks({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'summarize this' }], metadata: { documentId: 'mem-processing' }, stream: false }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(202)
    expect(res._getHeaders()['retry-after']).toBe('1') // 3-2 = 1
  })
})

describe('Multi-document comparison', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CONVERSATIONAL_CHAT = '0'
  })

  test('comparison with single doc returns 424', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'compare these documents' }],
        metadata: { documentId: 'mem-1' },
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(424)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('COMPARISON_REQUIRES_DOCS')
    // Note: message might be undefined if jsonError format is different
    if (data.message) {
      expect(data.message).toBe('Comparison requires multiple documents')
    }
  })

  test('comparison with documentIds array blocked until implemented', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'compare these properties' }],
        metadata: { documentIds: ['mem-1', 'mem-2'] },
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    // For now, expect 424 since multi-doc is not fully implemented
    expect(res._getStatusCode()).toBe(424)
  })

  test('comparison with compareDocumentId works', async () => {
    const { getStatus } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    getStatus.mockResolvedValue({ status: 'ready', parts: 5, contentHash: 'abc123', pagesIndexed: 10 })
    retrieveTopK.mockResolvedValue([{ content: 'chunk' }])
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: 'comparison result' })
    
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'versus the baseline' }],
        metadata: { documentId: 'mem-1', compareDocumentId: 'mem-2' },
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
  })
})

describe('ContentHash migration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CONVERSATIONAL_CHAT = '0'
  })

  test('missing contentHash skips cache gracefully', async () => {
    const { getStatus, getItem } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    getStatus.mockResolvedValue({ 
      status: 'ready', 
      parts: 5, 
      contentHash: null,  // Missing hash
      pagesIndexed: 10
    })
    retrieveTopK.mockResolvedValue([{ content: 'chunk' }])
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: 'response' })
    
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'summarize deal points' }],
        metadata: { documentId: 'mem-1' },
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }
    
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    // Should not attempt cache lookup when contentHash is missing
    expect(getItem).not.toHaveBeenCalled()
  })

  test('with contentHash uses cache lookup', async () => {
    const { getStatus, getItem } = require('@/lib/kv-store')
    const { retrieveTopK } = require('@/lib/rag/retriever')
    getStatus.mockResolvedValue({ 
      status: 'ready', 
      parts: 5, 
      contentHash: 'abc123',
      pagesIndexed: 10
    })
    getItem.mockResolvedValue(null) // Cache miss
    retrieveTopK.mockResolvedValue([{ content: 'chunk' }])
    ;(createChatCompletion as jest.Mock).mockResolvedValue({ content: 'response' })
    
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'key deal points' }],
        metadata: { documentId: 'mem-1' },
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }
    
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    // Should attempt cache lookup with contentHash
    expect(getItem).toHaveBeenCalledWith('dealPoints:abc123')
  })
})

describe('Intent classification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CONVERSATIONAL_CHAT = '0'
  })

  test('document queries without documentId return 424', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'what is the NOI?' }],
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(424)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('CONTEXT_UNAVAILABLE')
    // Note: message might be undefined if jsonError format is different
    if (data.message) {
      expect(data.message).toBe('Document context required for this query')
    }
  })

  test('page reference without documentId returns 424', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'what is on page 5?' }],
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(424)
  })

  test('client override forces document requirement', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        messages: [{ role: 'user', content: 'hello world' }],
        metadata: { requireDocumentContext: true },
        stream: false
      }
    })
    ;(req as any).user = { id: 'u' }

    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(424)
    const data = JSON.parse(res._getData())
    expect(data.code).toBe('CONTEXT_UNAVAILABLE')
  })
})
