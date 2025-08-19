/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/chat/fallback-text'
import { createChatCompletion } from '@/lib/services/openai'

jest.mock('@/lib/services/openai', () => ({
  createChatCompletion: jest.fn(async () => ({
    content: 'fallback response',
    model: 'gpt-mock',
    usage: {}
  }))
}))

describe('Fallback safety', () => {
  it('handles tool_choice without tools gracefully', async () => {
    process.env.ALLOW_DEV_NOAUTH = 'true'

    const payload = {
      messages: [{ role: 'user', content: 'test' }],
      tool_choice: 'auto'
    }
    jest.useFakeTimers()

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/chat/fallback-text',
      body: payload
    })

    await handler(req as any, res as any)
    jest.runOnlyPendingTimers()
    jest.useRealTimers()

    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res._getData())
    expect(data.message).toBeDefined()
    expect(data.message.length).toBeGreaterThan(0)

    const callPayload = (createChatCompletion as jest.Mock).mock.calls[0][0]
    expect(callPayload.tool_choice).toBe('none')
    expect(callPayload.tools).toBeUndefined()
  })
})
