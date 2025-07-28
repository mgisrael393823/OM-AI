import { createMocks } from 'node-mocks-http'

// Mock UploadThing to avoid ESM issues
jest.mock('uploadthing/next-legacy', () => ({
  createRouteHandler: () => () => Promise.resolve(),
  createUploadthing: () => () => ({ middleware: () => ({ onUploadComplete: jest.fn() }) })
}))

import handler from '../test-handler'

describe('uploadthing test handler', () => {
  it('returns ok', async () => {
    const { req, res } = createMocks({ method: 'GET' })
    await handler(req, res)
    expect(res._getStatusCode()).toBe(200)
    expect(res._getData()).toContain('ok')
  })
})
