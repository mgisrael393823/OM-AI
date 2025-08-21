import { createResponse } from 'node-mocks-http'
import { jsonError } from '@/lib/chat/errors'

test('produces nested error shape', () => {
  const res = createResponse()
  jsonError(res as any, 400, 'TEST_CODE', 'Test message', 'req-123')
  expect(res._getJSONData()).toMatchSnapshot()
})
