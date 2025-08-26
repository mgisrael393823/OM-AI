/** @jest-environment node */
jest.mock('@/lib/chat/fallbacks', () => ({ callWithFallback: jest.fn() }))
jest.mock('@/lib/services/openai/client-wrapper', () => ({ handleStream: jest.fn() }))
jest.mock('@/lib/chat/errors', () => ({ jsonError: jest.fn() }))

import { handle } from '@/lib/chat/handlers/responses'
import { callWithFallback } from '@/lib/chat/fallbacks'
import { handleStream } from '@/lib/services/openai/client-wrapper'
import { jsonError } from '@/lib/chat/errors'

const mockCall = callWithFallback as jest.Mock
const mockStream = handleStream as jest.Mock
const mockError = jsonError as jest.Mock

function createRes() {
  const chunks: any[] = []
  return {
    setHeader: jest.fn(),
    write: (c: any) => chunks.push(c),
    end: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    get data() { return chunks.join('') }
  } as any
}

describe('responses handler', () => {
  beforeEach(() => {
    mockCall.mockReset()
    mockStream.mockReset()
    mockError.mockReset()
  })

  it('maps max_tokens to max_output_tokens', async () => {
    mockCall.mockResolvedValue({ ok: true })
    const req: any = { body: { input: 'hi', model: 'gpt-5', max_tokens: 5, stream: false } }
    const res = createRes()
    await handle(req, res, { requestId: 'r', signal: new AbortController().signal, startTime: 0, isConversational: false })
    expect(mockCall).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 5 }), expect.any(String))
  })

  it('streams when enabled', async () => {
    mockCall.mockResolvedValue({})
    mockStream.mockImplementation(async function* (response, apiType) { yield 'hi' })
    const req: any = { body: { input: 'hi', model: 'gpt-5', stream: true } }
    const res = createRes()
    await handle(req, res, { requestId: 'r', signal: new AbortController().signal, startTime: 0, isConversational: false })
    expect(res.data).toBe('hi')
  })

  it('passes requestId on error', async () => {
    mockCall.mockRejectedValue({ status: 500, message: 'oops', code: 'ERR' })
    const req: any = { body: { input: 'hi', model: 'gpt-5', stream: false } }
    const res = createRes()
    await handle(req, res, { requestId: 'req-1', signal: new AbortController().signal, startTime: 0, isConversational: false })
    expect(mockError).toHaveBeenCalledWith(res, 500, 'ERR', 'oops', 'req-1', req)
  })
})