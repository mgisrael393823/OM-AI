import { createMocks } from 'node-mocks-http'
import { normalizeMarkdownBullets } from '@/lib/utils/markdown-normalizer'

// Mock TextEncoder
global.TextEncoder = require('util').TextEncoder

jest.mock('@/lib/auth-middleware', () => ({
  withAuth: jest.fn((h: any) => h),
  withRateLimit: jest.fn(() => (h: any) => h)
}))

jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn().mockResolvedValue({
    content: JSON.stringify({
      bullets: ['A','B','C'],
      citations: [{page:3},{page:4},{page:5}],
      confidence: true,
      distinctPages: 3,
      schema_version: 'v1.0'
    }),
    model: 'gpt-4o-mini',
    usage: { total_tokens: 150, prompt_tokens: 100, completion_tokens: 50 }
  }),
  fixResponseFormat: jest.fn()
}))

jest.mock('@/lib/services/openai/client-wrapper', () => ({
  handleStream: jest.fn().mockResolvedValue({
    content: JSON.stringify({
      bullets: ['A','B','C'],
      citations: [{page:3},{page:4},{page:5}],
      confidence: true,
      distinctPages: 3,
      schema_version: 'v1.0'
    }),
    usage: { prompt_tokens: 1, completion_tokens: 1 }
  })
}))

jest.mock('@/lib/chat/fallbacks', () => ({
  callWithFallback: jest.fn().mockResolvedValue(null)
}))

jest.mock('@/lib/kv-store', () => {
  const api = {
    getStatus: jest.fn(),
    getContext: jest.fn(),
    setContext: jest.fn(),
    getItem: jest.fn(),
    setItem: jest.fn(),
  }
  return { __esModule: true, ...api, default: api }
})

jest.mock('@/lib/rag/retriever', () => ({
  retrieveTopK: jest.fn().mockResolvedValue([
    { content: 'x', metadata: { page: 1 } },
    { content: 'y', metadata: { page: 2 } },
    { content: 'z', metadata: { page: 3 } }
  ])
}))

jest.mock('@/lib/rag/augment', () => ({
  augmentMessagesWithContext: jest.fn((chunks: any, messages: any) => ({
    chat: messages,
    responses: messages
  }))
}))

jest.mock('@sentry/nextjs', () => ({
  withScope: jest.fn((callback) => callback({
    setTag: jest.fn(),
    setContext: jest.fn()
  })),
  captureException: jest.fn()
}))

describe('Chat API - Markdown Rendering Integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.CONVERSATIONAL_CHAT = '0'
    process.env.MIN_PARTS = '5'
    process.env.USE_GPT5 = 'true'
  })

  describe('Deal Points Fast Path - Cached Response Normalization', () => {
    it('should format cached deal points as proper markdown bullets', async () => {
      const cachedDealPoints = {
        bullets: [
          "Property: 123 Main St, Chicago IL",
          "Price: $10,000,000 ($250k/unit)",
          "Size: 40 units, built 2018",
          "Returns: 5.25% cap, $525k NOI"
        ],
        citations: [
          { page: 3 },
          { page: 4 },
          { page: 5 },
          { page: 6 }
        ],
        source: "document analysis"
      }

      const { req, res } = createMocks({
        method: 'POST',
        headers: { origin: 'https://example.com' },
        body: { 
          messages: [{ role: 'user', content: 'what are the key deal points?' }], 
          metadata: { documentId: 'mem-123' },
          stream: false 
        }
      })
      ;(req as any).user = { id: 'test-user' }

      await jest.isolateModulesAsync(async () => {
        // Apply mocks before importing handler
        jest.doMock('@/lib/kv-store', () => {
          const api = {
            getStatus: jest.fn().mockResolvedValue({ 
              status: 'ready', 
              contentHash: 'abc123',
              parts: 5, 
              pagesIndexed: 10,
              chunksReady: 5,
              totalChunks: 5,
              isIndexing: false,
              isParsing: false
            }),
            getContext: jest.fn(),
            setContext: jest.fn(),
            getItem: jest.fn().mockResolvedValue(cachedDealPoints),
            setItem: jest.fn()
          }
          return { __esModule: true, ...api, default: api }
        })

        const { default: handler } = await import('../chat')
        await handler(req as any, res as any)
      })

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      
      // Verify the response contains normalized markdown bullets
      expect(data.message).toContain('## Key Deal Points')
      expect(data.message).toContain('- Property: 123 Main St, Chicago IL (Page 3)')
      expect(data.message).toContain('- Price: $10,000,000 ($250k/unit) (Page 4)')
      expect(data.message).toContain('- Size: 40 units, built 2018 (Page 5)')
      expect(data.message).toContain('- Returns: 5.25% cap, $525k NOI (Page 6)')
      expect(data.message).toContain('*Source: document analysis*')
      
      // Verify no Unicode bullets remain in response
      expect(data.message).not.toContain('•')
      
      // Verify metadata
      expect(data.source).toBe('dealPoints')
      expect(data.cacheHit).toBe(true)
    })

    it('should handle cached deal points without Unicode bullets', async () => {
      // Mock cached deal points already in correct format
      const cachedDealPoints = {
        bullets: [
          'Location: Historic downtown area',
          'Property type: Mixed-use development',
          'Total investment: $15M'
        ],
        citations: [
          { page: 2, text: 'property details' },
          { page: 7, text: 'investment summary' }
        ],
        source: 'regex'
      }

      const { req, res } = createMocks({
        method: 'POST',
        body: { 
          messages: [{ role: 'user', content: 'key deal points' }], 
          metadata: { documentId: 'mem-456' },
          stream: false 
        }
      })
      ;(req as any).user = { id: 'test-user' }

      await jest.isolateModulesAsync(async () => {
        // Apply mocks before importing handler
        jest.doMock('@/lib/kv-store', () => {
          const api = {
            getStatus: jest.fn().mockResolvedValue({ 
              status: 'ready', 
              contentHash: 'def456',
              parts: 5, 
              pagesIndexed: 8,
              chunksReady: 5,
              totalChunks: 5,
              isIndexing: false,
              isParsing: false
            }),
            getContext: jest.fn(),
            setContext: jest.fn(),
            getItem: jest.fn().mockResolvedValue(cachedDealPoints),
            setItem: jest.fn()
          }
          return { __esModule: true, ...api, default: api }
        })

        const { default: handler } = await import('../chat')
        await handler(req as any, res as any)
      })

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      
      // Verify content is properly formatted
      expect(data.message).toContain('## Key Deal Points')
      expect(data.message).toContain('- Location: Historic downtown area')
      expect(data.message).toContain('- Property type: Mixed-use development')
      expect(data.message).toContain('- Total investment: $15M')
    })
  })

  describe('Deal Points New Extraction - Stage A Response Normalization', () => {
    it('should normalize Unicode bullets in fresh AI-generated responses', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: { 
          messages: [{ role: 'user', content: 'extract key deal points' }], 
          metadata: { documentId: 'mem-fresh' },
          stream: false 
        }
      })
      ;(req as any).user = { id: 'test-user' }

      await jest.isolateModulesAsync(async () => {
        // Apply all mocks before importing handler
        jest.doMock('@/lib/services/openai', () => ({
          createChatCompletion: jest.fn().mockResolvedValue({
            content: JSON.stringify({
              bullets: ['A','B','C'],
              citations: [{page:3},{page:4},{page:5}],
              confidence: true,
              distinctPages: 3,
              schema_version: 'v1.0'
            }),
            model: 'gpt-4o-mini',
            usage: { total_tokens: 150, prompt_tokens: 100, completion_tokens: 50 }
          }),
          fixResponseFormat: jest.fn()
        }))

        jest.doMock('@/lib/services/openai/client-wrapper', () => ({
          handleStream: jest.fn().mockResolvedValue({
            content: JSON.stringify({
              bullets: ['A','B','C'],
              citations: [{page:3},{page:4},{page:5}],
              confidence: true,
              distinctPages: 3,
              schema_version: 'v1.0'
            }),
            usage: { prompt_tokens: 1, completion_tokens: 1 }
          })
        }))

        jest.doMock('@/lib/rag/retriever', () => ({
          retrieveTopK: jest.fn().mockResolvedValue([
            { content: 'x', metadata: { page: 1 } },
            { content: 'y', metadata: { page: 2 } },
            { content: 'z', metadata: { page: 3 } }
          ])
        }))

        jest.doMock('@/lib/chat/fallbacks', () => ({
          callWithFallback: jest.fn().mockResolvedValue(null)
        }))

        jest.doMock('@/lib/kv-store', () => {
          const api = {
            getStatus: jest.fn().mockResolvedValue({ 
              status: 'ready', 
              contentHash: 'fresh123',
              parts: 5,  // Meet required parts for 12 pages (min 5 required)
              pagesIndexed: 12,
              chunksReady: 5,
              totalChunks: 5,
              isIndexing: false,
              isParsing: false
            }),
            getContext: jest.fn(),
            setContext: jest.fn(),
            getItem: jest.fn().mockResolvedValue(null), // No cached deal points
            setItem: jest.fn()
          }
          return { __esModule: true, ...api, default: api }
        })

        jest.doMock('@sentry/nextjs', () => ({
          withScope: jest.fn((callback) => callback({
            setTag: jest.fn(),
            setContext: jest.fn()
          })),
          captureException: jest.fn()
        }))

        const { default: handler } = await import('../chat')
        await handler(req as any, res as any)
      })

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      
      // Verify Unicode bullets are normalized to markdown hyphens
      expect(data.message).toContain('## Key Deal Points')
      expect(data.message).toContain('- A (Page 3)')
      expect(data.message).toContain('- B (Page 4)')  
      expect(data.message).toContain('- C (Page 5)')
      
      // Verify no Unicode bullets remain
      expect(data.message).not.toContain('•')
    })
  })

  describe('General Chat Response Normalization', () => {
    it('should normalize Unicode bullets in general chat responses', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: { 
          messages: [{ role: 'user', content: 'what are the benefits of this investment?' }], 
          stream: false 
        }
      })
      ;(req as any).user = { id: 'test-user' }

      await jest.isolateModulesAsync(async () => {
        // Apply mocks before importing handler
        jest.doMock('@/lib/services/openai', () => ({
          createChatCompletion: jest.fn().mockResolvedValue({
            content: `Here are the main benefits:\n\n• Lower risk profile\n• Steady cash flow\n• Tax advantages`,
            model: 'gpt-4',
            usage: { total_tokens: 80, prompt_tokens: 50, completion_tokens: 30 }
          }),
          fixResponseFormat: jest.fn()
        }))

        jest.doMock('@sentry/nextjs', () => ({
          withScope: jest.fn((callback) => callback({
            setTag: jest.fn(),
            setContext: jest.fn()
          })),
          captureException: jest.fn()
        }))

        const { default: handler } = await import('../chat')
        await handler(req as any, res as any)
      })

      expect(res._getStatusCode()).toBe(200)
      const data = JSON.parse(res._getData())
      
      // Verify Unicode bullets are normalized
      expect(data.message).toContain('- Lower risk profile')
      expect(data.message).toContain('- Steady cash flow')
      expect(data.message).toContain('- Tax advantages')
      expect(data.message).not.toContain('•')
    })
  })

  describe('Markdown Normalizer Direct Testing', () => {
    it('should preserve code blocks during normalization', () => {
      const input = `Here's some markdown:\n\n\`\`\`markdown\n• This should not change\n● Neither should this\n\`\`\`\n\nBut this should:\n• Convert this bullet`
      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toContain('• This should not change')
      expect(result.content).toContain('● Neither should this')
      expect(result.content).toContain('- Convert this bullet')
      expect(result.wasNormalized).toBe(true)
    })

    it('should handle mixed bullet types', () => {
      const input = `Investment Summary:\n• Primary benefit\n● Secondary benefit\n▪ Third benefit\n- Already correct`
      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toContain('- Primary benefit')
      expect(result.content).toContain('- Secondary benefit')
      expect(result.content).toContain('- Third benefit')
      expect(result.content).toContain('- Already correct')
      expect(result.changesCount).toBe(3) // Only the first 3 needed conversion
    })

    it('should add proper header spacing', () => {
      const input = `## Investment Highlights\n• Strong market position\n### Financial Performance\n• Consistent returns`
      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toContain('## Investment Highlights\n\n- Strong market position')
      expect(result.content).toContain('### Financial Performance\n\n- Consistent returns')
      expect(result.patterns).toContain('header_spacing')
      expect(result.patterns).toContain('unicode_bullets')
    })
  })
})