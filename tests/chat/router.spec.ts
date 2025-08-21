jest.mock('@/lib/chat/handlers/completions', () => ({ handle: jest.fn() }))
jest.mock('@/lib/chat/handlers/responses', () => ({ handle: jest.fn() }))

import { handle } from '@/lib/chat/router'
import { handle as completionsHandle } from '@/lib/chat/handlers/completions'
import { handle as responsesHandle } from '@/lib/chat/handlers/responses'

const mockComp = completionsHandle as jest.Mock
const mockResp = responsesHandle as jest.Mock

function createReq(body: any = {}) {
  return { headers: {}, body, query: {} } as any
}

const res: any = {}

describe('router', () => {
  beforeEach(() => {
    mockComp.mockReset().mockResolvedValue(undefined)
    mockResp.mockReset().mockResolvedValue(undefined)
    delete process.env.USE_GPT5
    delete process.env.CONVERSATIONAL_CHAT
  })

  it('uses completions by default', async () => {
    await handle(createReq({ model: 'gpt-4o' }), res)
    expect(mockComp).toHaveBeenCalled()
  })

  it('uses responses when USE_GPT5 and model supports', async () => {
    process.env.USE_GPT5 = '1'
    await handle(createReq({ model: 'gpt-5' }), res)
    expect(mockResp).toHaveBeenCalled()
  })

  it('passes conversational flag', async () => {
    process.env.CONVERSATIONAL_CHAT = '1'
    await handle(createReq({ model: 'gpt-4o' }), res)
    const ctx = mockComp.mock.calls[0][2]
    expect(ctx.isConversational).toBe(true)
  })
})
