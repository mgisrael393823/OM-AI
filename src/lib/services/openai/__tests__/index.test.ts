// Mock OpenAI client
jest.mock('openai', () => {
  const mockResponsesCreate = jest.fn()
  const mockChatCreate = jest.fn()

  const MockOpenAI = jest.fn().mockImplementation(() => ({
    responses: { create: mockResponsesCreate },
    chat: { completions: { create: mockChatCreate } }
  }))

  ;(MockOpenAI as any).__mockResponsesCreate = mockResponsesCreate
  ;(MockOpenAI as any).__mockChatCreate = mockChatCreate

  return MockOpenAI
})

import { buildChatCompletionPayload, buildResponsesPayload } from '../builders'
import { createChatCompletion } from '..'

describe('OpenAI Service', () => {
  let mockResponsesCreate: jest.Mock
  let mockChatCreate: jest.Mock

  beforeAll(() => {
    const OpenAI = require('openai')
    mockResponsesCreate = (OpenAI as any).__mockResponsesCreate
    mockChatCreate = (OpenAI as any).__mockChatCreate
  })

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CHAT_MAX_TOKENS = '2000'
  })

  it('chatCompletion builder constructs payload', () => {
    const built = buildChatCompletionPayload({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] })
    expect(built).toEqual({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 2000
    })
  })

  it('responses builder constructs payload', () => {
    const built = buildResponsesPayload({ model: 'gpt-5', messages: [{ role: 'user', content: 'hi' }] })
    expect(built).toEqual({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_output_tokens: 2000
    })
  })

  it('responses builder emits text.format when provided', () => {
    const built = buildResponsesPayload({ model: 'gpt-5', messages: [{ role: 'user', content: 'hi' }], format: 'markdown' })
    expect(built).toEqual({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_output_tokens: 2000,
      response_format: { type: 'text', text: { format: 'markdown' } }
    })
  })

  it('uses chat API and normalizes response', async () => {
    const mockResp = {
      choices: [{ message: { content: 'hello' } }],
      usage: { total_tokens: 10 },
      model: 'gpt-4'
    }
    mockChatCreate.mockResolvedValueOnce(mockResp)

    const result = await createChatCompletion(
      buildChatCompletionPayload({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 })
    )

    expect(mockChatCreate).toHaveBeenCalledWith(
      { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
      expect.objectContaining({ signal: expect.any(Object) })
    )
    expect(result).toEqual({ content: 'hello', model: 'gpt-4', usage: { total_tokens: 10 } })
  })

  it('retries on timeout errors', async () => {
    const timeoutError: any = new Error('ETIMEDOUT')
    timeoutError.code = 'ETIMEDOUT'
    mockChatCreate
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({ choices: [{ message: { content: 'retry' } }], usage: {}, model: 'gpt-4' })

    const result = await createChatCompletion(
      buildChatCompletionPayload({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] })
    )

    expect(mockChatCreate).toHaveBeenCalledTimes(2)
    expect(result.content).toBe('retry')
  })

  it('uses responses API when input provided', async () => {
    const mockResp = { output_text: 'ok', usage: { total_tokens: 5 } }
    mockResponsesCreate.mockResolvedValueOnce(mockResp)

    const result = await createChatCompletion(
      buildResponsesPayload({ model: 'gpt-5', messages: [{ role: 'user', content: 'hi' }] })
    )

    expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ content: 'ok', model: 'gpt-5', usage: { total_tokens: 5 } })
  })
})
