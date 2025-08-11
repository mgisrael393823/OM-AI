// Mock OpenAI client  
jest.mock('openai', () => {
  const mockResponsesCreate = jest.fn()
  const mockChatCreate = jest.fn()
  
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    responses: { create: mockResponsesCreate },
    chat: { completions: { create: mockChatCreate } }
  }))
  
  // Expose mocks for tests to access
  ;(MockOpenAI as any).__mockResponsesCreate = mockResponsesCreate
  ;(MockOpenAI as any).__mockChatCreate = mockChatCreate
  
  return MockOpenAI
})

import { createChatCompletion } from '../index'

describe('OpenAI Service', () => {
  let mockResponsesCreate: jest.Mock
  let mockChatCreate: jest.Mock
  
  beforeAll(() => {
    // Get the mock functions from the mocked OpenAI constructor
    const OpenAI = require('openai')
    mockResponsesCreate = (OpenAI as any).__mockResponsesCreate
    mockChatCreate = (OpenAI as any).__mockChatCreate
  })
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockResponsesCreate.mockReset()
    mockChatCreate.mockReset()
    
    // Reset environment variables
    process.env.OPENAI_MODEL = 'gpt-4'
    process.env.OPENAI_FALLBACK_MODEL = 'gpt-4.1'
    process.env.CHAT_MAX_TOKENS = '2000'
  })

  const sampleMessages = [
    { role: 'user' as const, content: 'Hello' },
    { role: 'assistant' as const, content: 'Hi there!' }
  ]

  describe('Parameter Handling', () => {
    it('should never send temperature to Responses API models', async () => {
      const mockResponse = {
        output_text: 'Test response',
        usage: { prompt_tokens: 10, completion_tokens: 20 },
        id: 'test-123'
      }
      mockResponsesCreate.mockResolvedValueOnce(mockResponse)

      await createChatCompletion({
        model: 'gpt-5',
        messages: sampleMessages,
        temperature: 0.8
      })

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'gpt-5',
        input: 'USER: Hello\nASSISTANT: Hi there!',
        max_output_tokens: 2000
      })
      
      // Verify no temperature parameter was sent
      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({ temperature: expect.anything() })
      )
    })

    it('should send temperature to Chat Completions API', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
        model: 'gpt-4',
        id: 'test-123'
      }
      mockChatCreate.mockResolvedValueOnce(mockResponse)

      await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages,
        temperature: 0.8
      })

      expect(mockChatCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: sampleMessages,
        max_tokens: 2000,
        temperature: 0.8
      })
    })

    it('should use max_output_tokens for Responses and max_tokens for Chat', async () => {
      // Test Responses API
      mockResponsesCreate.mockResolvedValueOnce({
        output_text: 'Response',
        usage: {},
        id: 'test'
      })

      await createChatCompletion({
        model: 'gpt-5',
        messages: sampleMessages,
        max_output_tokens: 1500
      })

      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_output_tokens: 1500 })
      )

      // Test Chat API
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Response' } }],
        usage: {},
        model: 'gpt-4'
      })

      await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages,
        max_tokens: 1500
      })

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1500 })
      )
    })
  })

  describe('Temperature Retry Logic', () => {
    it('should retry Chat Completions without temperature on 400 temperature error', async () => {
      const temperatureError = {
        status: 400,
        message: "Invalid request: Unsupported parameter: 'temperature'"
      }

      const successResponse = {
        choices: [{ message: { content: 'Success after retry' } }],
        usage: { prompt_tokens: 10, completion_tokens: 15 },
        model: 'gpt-4',
        id: 'retry-success'
      }

      // First call fails with temperature error, second succeeds
      mockChatCreate
        .mockRejectedValueOnce(temperatureError)
        .mockResolvedValueOnce(successResponse)

      const result = await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages,
        temperature: 0.5
      })

      // Should have been called twice
      expect(mockChatCreate).toHaveBeenCalledTimes(2)
      
      // First call with temperature
      expect(mockChatCreate).toHaveBeenNthCalledWith(1, {
        model: 'gpt-4',
        messages: sampleMessages,
        max_tokens: 2000,
        temperature: 0.5
      })
      
      // Second call without temperature
      expect(mockChatCreate).toHaveBeenNthCalledWith(2, {
        model: 'gpt-4',
        messages: sampleMessages,
        max_tokens: 2000
      })

      expect(result).toEqual({
        text: 'Success after retry',
        usage: { prompt_tokens: 10, completion_tokens: 15 },
        model: 'gpt-4'
      })
    })

    it('should not retry Responses API for temperature errors', async () => {
      const temperatureError = {
        status: 400,
        message: "Invalid request: Unsupported parameter: 'temperature'"
      }

      // Only reject once - no fallback should occur for parameter errors
      mockResponsesCreate.mockRejectedValue(temperatureError)

      await expect(createChatCompletion({
        model: 'gpt-5',
        messages: sampleMessages
      })).rejects.toEqual(expect.objectContaining({
        status: 400,
        message: expect.stringContaining('temperature')
      }))

      // Should only be called once (no retry for Responses API)
      expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
    })

    it('should not retry on non-temperature 400 errors', async () => {
      const otherError = {
        status: 400,
        message: 'Invalid request: Invalid model specified'
      }

      mockChatCreate.mockRejectedValueOnce(otherError)

      await expect(createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages
      })).rejects.toEqual(otherError)

      expect(mockChatCreate).toHaveBeenCalledTimes(1)
    })
  })

  describe('Fallback Policy', () => {
    it('should not fallback on 4xx client errors', async () => {
      const clientError = {
        status: 401,
        message: 'Unauthorized: Invalid API key'
      }

      mockChatCreate.mockRejectedValueOnce(clientError)

      await expect(createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages
      })).rejects.toEqual(clientError)

      // Should not try fallback model
      expect(mockChatCreate).toHaveBeenCalledTimes(1)
      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' })
      )
    })

    it('should fallback on 5xx server errors', async () => {
      const serverError = {
        status: 503,
        message: 'Service temporarily unavailable'
      }

      const fallbackResponse = {
        choices: [{ message: { content: 'Fallback response' } }],
        usage: { prompt_tokens: 8, completion_tokens: 12 },
        model: 'gpt-4.1',
        id: 'fallback-success'
      }

      // First call fails with server error, second succeeds with fallback model
      mockChatCreate
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(fallbackResponse)

      const result = await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages
      })

      expect(mockChatCreate).toHaveBeenCalledTimes(2)
      expect(result.model).toBe('gpt-4.1')
    })

    it('should fallback on model not found errors', async () => {
      const modelError = {
        status: 404,
        message: 'Model gpt-unknown-chat-model not found'
      }

      // The fallback model (gpt-4.1) is a Responses API model, so mock that
      const fallbackResponse = {
        output_text: 'Fallback response',
        usage: { prompt_tokens: 5, completion_tokens: 10 },
        id: 'fallback-123'
      }
      
      // First call to non-existent Chat model fails, second to Responses fallback succeeds
      mockChatCreate.mockRejectedValueOnce(modelError)
      mockResponsesCreate.mockResolvedValueOnce(fallbackResponse)

      const result = await createChatCompletion({
        model: 'gpt-unknown-chat-model', // Use a model name that maps to Chat API
        messages: sampleMessages
      })

      expect(mockChatCreate).toHaveBeenCalledTimes(1) // Original call fails
      expect(mockResponsesCreate).toHaveBeenCalledTimes(1) // Fallback to gpt-4.1 (Responses)
      expect(result.model).toBe('gpt-4.1') // fallback model
      expect(result.text).toBe('Fallback response')
    })

    it('should fallback on network errors', async () => {
      const networkError = {
        message: 'ETIMEDOUT: Connection timed out'
      }

      const fallbackResponse = {
        choices: [{ message: { content: 'After timeout retry' } }],
        usage: { prompt_tokens: 6, completion_tokens: 8 },
        model: 'gpt-4.1'
      }

      mockChatCreate
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(fallbackResponse)

      const result = await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages
      })

      expect(result.text).toBe('After timeout retry')
    })
  })

  describe('Response Normalization', () => {
    it('should return normalized format for Responses API', async () => {
      const mockResponse = {
        output_text: '  Test response with spaces  ',
        usage: { prompt_tokens: 15, completion_tokens: 25 },
        id: 'resp-123'
      }
      mockResponsesCreate.mockResolvedValueOnce(mockResponse)

      const result = await createChatCompletion({
        model: 'gpt-5',
        messages: sampleMessages
      })

      expect(result).toEqual({
        text: 'Test response with spaces',
        usage: { prompt_tokens: 15, completion_tokens: 25 },
        model: 'gpt-5'
      })
    })

    it('should return normalized format for Chat Completions', async () => {
      const mockResponse = {
        choices: [{ message: { content: '  Chat response  ' } }],
        usage: { prompt_tokens: 12, completion_tokens: 18 },
        model: 'gpt-4',
        id: 'chat-456'
      }
      mockChatCreate.mockResolvedValueOnce(mockResponse)

      const result = await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages
      })

      expect(result).toEqual({
        text: 'Chat response',
        usage: { prompt_tokens: 12, completion_tokens: 18 },
        model: 'gpt-4'
      })
    })

    it('should handle missing response content gracefully', async () => {
      // Test Responses API with missing output_text
      mockResponsesCreate.mockResolvedValueOnce({
        usage: {},
        id: 'empty-resp'
      })

      const responsesResult = await createChatCompletion({
        model: 'gpt-5',
        messages: sampleMessages
      })

      expect(responsesResult.text).toBe('')
      expect(responsesResult.model).toBe('gpt-5')

      // Test Chat API with missing choices
      mockChatCreate.mockResolvedValueOnce({
        choices: [],
        usage: {},
        model: 'gpt-4'
      })

      const chatResult = await createChatCompletion({
        model: 'gpt-4',
        messages: sampleMessages
      })

      expect(chatResult.text).toBe('')
      expect(chatResult.model).toBe('gpt-4')
    })
  })

  describe('Model Detection', () => {
    it.each([
      'gpt-5',
      'gpt-5-turbo',
      'gpt-4.1',
      'gpt-4.1-preview',
      'o4',
      'o3'
    ])('should detect %s as Responses API model', async (model) => {
      mockResponsesCreate.mockResolvedValueOnce({
        output_text: 'Response',
        usage: {},
        id: 'test'
      })

      await createChatCompletion({ model, messages: sampleMessages })

      expect(mockResponsesCreate).toHaveBeenCalled()
      expect(mockChatCreate).not.toHaveBeenCalled()
    })

    it.each([
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-3.5-turbo'
    ])('should detect %s as Chat Completions model', async (model) => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Response' } }],
        usage: {},
        model
      })

      await createChatCompletion({ model, messages: sampleMessages })

      expect(mockChatCreate).toHaveBeenCalled()
      expect(mockResponsesCreate).not.toHaveBeenCalled()
    })
  })
})