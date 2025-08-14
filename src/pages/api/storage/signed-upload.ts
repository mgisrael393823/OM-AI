import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, type AuthenticatedRequest } from '@/lib/auth-middleware'

// Enable body parsing for JSON input
export const config = {
  api: {
    bodyParser: true
  }
}

interface SignedUploadRequest {
  filename: string
  contentType: string
}

interface SignedUploadResponse {
  path: string
  token: string
}

interface ErrorResponse {
  error: string
}

async function signedUploadHandler(
  req: AuthenticatedRequest, 
  res: NextApiResponse<SignedUploadResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    // Validate request body
    const { filename, contentType }: SignedUploadRequest = req.body

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename is required and must be a string' })
    }

    if (!contentType || typeof contentType !== 'string') {
      return res.status(400).json({ error: 'contentType is required and must be a string' })
    }

    // Validate file type (PDF and common images)
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ]

    if (!allowedTypes.includes(contentType.toLowerCase())) {
      return res.status(400).json({ 
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` 
      })
    }

    // Get user ID from authenticated session
    const userId = req.user.id

    // Generate unique path with timestamp
    const timestamp = Date.now()
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${userId}/${timestamp}-${sanitizedFilename}`

    // Create admin client with service role key
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Generate signed upload URL
    const { data, error } = await admin.storage
      .from('documents')
      .createSignedUploadUrl(path)

    if (error) {
      console.error('Failed to create signed upload URL:', error)
      return res.status(500).json({ 
        error: 'Failed to generate upload URL' 
      })
    }

    if (!data?.token) {
      console.error('No token returned from createSignedUploadUrl')
      return res.status(500).json({ 
        error: 'Invalid response from storage service' 
      })
    }

    console.log('Generated signed upload URL', {
      userId,
      path,
      contentType,
      filename: sanitizedFilename
    })

    return res.status(200).json({
      path,
      token: data.token
    })

  } catch (error: any) {
    console.error('Signed upload API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error' 
    })
  }
}

export default withAuth(signedUploadHandler)