import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createApiError, ERROR_CODES } from '@/lib/constants/errors'

// This endpoint should only be called once to set up storage buckets
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
  }

  // Use service role key for admin operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false
      }
    }
  )

  try {
    // Create documents bucket
    const { data, error } = await supabase
      .storage
      .createBucket('documents', {
        public: false, // Keep private for security
        fileSizeLimit: 10485760, // 10MB limit
        allowedMimeTypes: ['application/pdf']
      })

    if (error) {
      // Bucket might already exist
      if (error.message.includes('already exists')) {
        return res.status(200).json({ 
          message: 'Storage bucket already exists',
          bucket: 'documents' 
        })
      }
      throw error
    }

    // Set up storage policies for authenticated users
    const policies = [
      {
        name: 'Users can upload their own documents',
        definition: `(auth.uid() = owner)`,
        allowedOperations: ['INSERT']
      },
      {
        name: 'Users can view their own documents',
        definition: `(auth.uid() = owner)`,
        allowedOperations: ['SELECT']
      },
      {
        name: 'Users can delete their own documents',
        definition: `(auth.uid() = owner)`,
        allowedOperations: ['DELETE']
      }
    ]

    return res.status(200).json({ 
      success: true, 
      message: 'Storage bucket created successfully',
      bucket: data,
      policies: 'Policies need to be configured in Supabase dashboard'
    })
  } catch (error) {
    console.error('Error setting up storage:', error)
    return createApiError(
      res,
      ERROR_CODES.STORAGE_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}