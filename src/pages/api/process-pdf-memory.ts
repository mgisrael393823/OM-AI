import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { promises as fs } from 'fs'
import { withAuth, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { processInMemory } from '@/lib/document-processor'

// Force Node.js runtime for singleton consistency
export const runtime = 'nodejs'

// Check USE_CANVAS environment flag
const USE_CANVAS = process.env.USE_CANVAS === 'true'

export const config = { 
  api: { 
    bodyParser: false,
    sizeLimit: '4.5mb' // Vercel platform limit
  } 
}

async function processMemoryHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // Log canvas status at request start
  let canvasStatus: any = { available: false, reason: 'Canvas disabled' }
  
  if (USE_CANVAS) {
    try {
      const { getCanvasStatus } = await import('@/lib/canvas-loader')
      canvasStatus = getCanvasStatus()
    } catch (error) {
      console.warn('[process-pdf-memory] Failed to load canvas status:', error)
      canvasStatus = { available: false, reason: 'Canvas loader failed to import' }
    }
  } else {
    console.log('[process-pdf-memory] Canvas disabled, using text-only processing')
  }
  
  console.log('[process-pdf-memory] Starting PDF processing', {
    userId: req.user.id,
    canvasRequested: USE_CANVAS,
    canvasStatus: {
      available: canvasStatus.available,
      reason: canvasStatus.reason,
      mode: USE_CANVAS && canvasStatus.available ? 'enhanced' : 'text-only'
    }
  })

  try {
    const form = formidable({ multiples: false, maxFileSize: 4.5 * 1024 * 1024 }) // 4.5MB Vercel limit
    const { files } = await new Promise<{ files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, _fields, files) => (err ? reject(err) : resolve({ files })))
    })

    const anyFile = (files.file || files.document || Object.values(files)[0]) as formidable.File | formidable.File[] | undefined
    if (!anyFile) return res.status(400).json({ error: 'No file uploaded' })

    const file = Array.isArray(anyFile) ? anyFile[0] : anyFile
    const filepath = (file as any).filepath || (file as any).path
    const buffer = await fs.readFile(filepath)
    const originalFilename = (file as any).originalFilename || (file as any).newFilename || 'document.pdf'

    const result = await processInMemory(buffer, {
      userId: req.user.id,
      originalFilename,
      useCanvas: USE_CANVAS
    })

    // Add documentId for frontend compatibility
    const response = {
      ...result,
      documentId: result.requestId
    }

    console.log(`[process-pdf-memory] Processing completed for ${originalFilename}`, {
      requestId: result.requestId,
      chunkCount: result.document.chunkCount,
      pageCount: result.document.pageCount,
      runtime: 'nodejs',
      pid: process.pid
    })

    return res.status(200).json(response)
  } catch (err: any) {
    const msg = err?.message || 'Processing failed'
    const code = /timeout/i.test(msg) ? 504 : 500
    return res.status(code).json({ error: msg })
  }
}

export default withAuth(processMemoryHandler)