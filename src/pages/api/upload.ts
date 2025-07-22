import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' })
  }

  const token = authHeader.replace('Bearer ', '')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  )

  // Get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const form = formidable({
    maxFileSize: 10 * 1024 * 1024, // 10MB
    filter: function ({ mimetype }) {
      return mimetype ? mimetype.includes('pdf') : false
    }
  })

  try {
    const [fields, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Read file
    const fileBuffer = fs.readFileSync(file.filepath)
    
    // Generate unique filename
    const fileExt = file.originalFilename?.split('.').pop() || 'pdf'
    const fileName = `${user.id}/${uuidv4()}.${fileExt}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('documents')
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype || 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return res.status(500).json({ error: 'Failed to upload file' })
    }

    // Save document metadata to database
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        name: file.originalFilename || 'Untitled Document',
        file_path: uploadData.path,
        file_size: file.size,
        file_type: file.mimetype || 'application/pdf',
        status: 'uploaded'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('documents').remove([fileName])
      return res.status(500).json({ error: 'Failed to save document metadata' })
    }

    // Get public URL (though it's private, this creates the reference)
    const { data: { publicUrl } } = supabase
      .storage
      .from('documents')
      .getPublicUrl(fileName)

    // Clean up temp file
    fs.unlinkSync(file.filepath)

    return res.status(200).json({
      success: true,
      document: {
        id: documentData.id,
        name: documentData.name,
        size: documentData.file_size,
        type: documentData.file_type,
        status: documentData.status,
        uploadedAt: documentData.created_at,
        filePath: documentData.file_path
      }
    })
  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ 
      error: 'Failed to process upload',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}