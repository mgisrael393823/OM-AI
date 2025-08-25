/** @jest-environment node */
import { createResponse, createRequest } from 'node-mocks-http'
import { jsonError } from '@/lib/chat/errors'

describe('chat errors', () => {
  it('produces legacy error shape by default', () => {
    const req = createRequest()
    const res = createResponse()
    jsonError(res as any, 400, 'TEST_CODE', 'Test message', 'req-123', req as any)
    expect(res._getJSONData()).toEqual({
      error: 'Test message',
      code: 'TEST_CODE',
      requestId: 'req-123'
    })
  })

  it('produces structured error shape when requested via header', () => {
    const req = createRequest({
      headers: {
        'x-error-format': 'structured'
      }
    })
    const res = createResponse()
    jsonError(res as any, 400, 'TEST_CODE', 'Test message', 'req-123', req as any)
    expect(res._getJSONData()).toMatchSnapshot()
  })

  it('produces structured error shape when requested via query param', () => {
    const req = createRequest({
      query: {
        errorFormat: 'structured'
      }
    })
    const res = createResponse()
    jsonError(res as any, 400, 'TEST_CODE', 'Test message', 'req-123', req as any)
    expect(res._getJSONData()).toMatchSnapshot()
  })

  it('defaults to legacy format without request object', () => {
    const res = createResponse()
    jsonError(res as any, 400, 'TEST_CODE', 'Test message', 'req-123')
    expect(res._getJSONData()).toEqual({
      error: 'Test message',
      code: 'TEST_CODE',
      requestId: 'req-123'
    })
  })
})