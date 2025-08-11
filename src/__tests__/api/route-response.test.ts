import { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'

// Mock the modules
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-123', email: 'test@example.com' } },
        error: null
      })
    }
  }))
}))

jest.mock('@/lib/constants/errors', () => ({
  ERROR_CODES: {
    MISSING_TOKEN: { status: 401, message: 'Missing authentication token' },
    INVALID_TOKEN: { status: 401, message: 'Invalid authentication token' },
    INTERNAL_ERROR: { status: 500, message: 'Internal server error' }
  },
  createApiError: jest.fn((res, errorCode, details) => {
    res.status(errorCode.status).json({
      error: errorCode.message,
      ...(details && { details })
    })
  })
}))

describe('API Route Response Handling', () => {
  let req: Partial<NextApiRequest>
  let res: Partial<NextApiResponse>

  beforeEach(() => {
    req = {
      method: 'GET',
      headers: { authorization: 'Bearer valid-token' },
      cookies: {}
    }
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    }
    
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  describe('Route patterns that always send responses', () => {
    it('should always send response for GET handler', async () => {
      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        if (req.method === 'GET') {
          return res.status(200).json({ message: 'Success' })
        }
        return res.status(405).json({ error: 'Method not allowed' })
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalled()
    })

    it('should always send response for POST handler', async () => {
      req.method = 'POST'
      req.body = { data: 'test' }

      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        if (req.method === 'POST') {
          return res.status(201).json({ id: 123, ...req.body })
        }
        return res.status(405).json({ error: 'Method not allowed' })
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({ id: 123, data: 'test' })
    })

    it('should send 405 for unsupported methods', async () => {
      req.method = 'DELETE'

      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        if (req.method === 'GET') {
          return res.status(200).json({ message: 'Success' })
        }
        return res.status(405).json({ error: 'Method not allowed' })
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
    })

    it('should handle async errors and send error response', async () => {
      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        throw new Error('Database connection failed')
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      // Should send error response due to auth middleware error handling
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalled()
    })
  })

  describe('Missing token scenarios', () => {
    it('should send 401 when no authorization header', async () => {
      req.headers = {} // No authorization header

      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        return res.status(200).json({ message: 'Should not reach here' })
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing authentication token'
        })
      )
    })

    it('should send 401 when token is malformed', async () => {
      req.headers = { authorization: 'Malformed token' }

      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        return res.status(200).json({ message: 'Should not reach here' })
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalled()
    })
  })

  describe('Happy path scenarios', () => {
    it('should send 200 for successful authenticated request', async () => {
      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        return res.status(200).json({ 
          message: 'Success', 
          userId: req.userId,
          userEmail: req.user.email
        })
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Success',
        userId: 'test-user-123',
        userEmail: 'test@example.com'
      })
    })

    it('should pass through custom status codes', async () => {
      const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
        res.status(204).end()
      }

      const wrappedHandler = withAuth(handler)
      await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.end).toHaveBeenCalled()
    })
  })

  describe('No fall-through validation', () => {
    it('should never complete without sending a response', async () => {
      const handlers = [
        // Handler that always responds
        async (req: AuthenticatedRequest, res: NextApiResponse) => {
          return res.status(200).json({ success: true })
        },
        // Handler with conditional logic
        async (req: AuthenticatedRequest, res: NextApiResponse) => {
          if (req.method === 'GET') {
            return res.status(200).json({ method: 'GET' })
          }
          if (req.method === 'POST') {
            return res.status(201).json({ method: 'POST' })
          }
          return res.status(405).json({ error: 'Method not allowed' })
        }
      ]

      for (const handler of handlers) {
        jest.clearAllMocks()
        
        const wrappedHandler = withAuth(handler)
        await wrappedHandler(req as NextApiRequest, res as NextApiResponse)

        // Verify that either status was called (indicating a response) or json/end was called
        const responseMethodCalled = 
          (res.status as jest.Mock).mock.calls.length > 0 ||
          (res.json as jest.Mock).mock.calls.length > 0 ||
          (res.end as jest.Mock).mock.calls.length > 0

        expect(responseMethodCalled).toBe(true)
      }
    })
  })
})