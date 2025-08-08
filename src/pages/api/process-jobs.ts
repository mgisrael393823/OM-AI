import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getConfig } from '@/lib/config'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'
import type { Database } from '@/types/database'

interface ProcessingJob {
  id: string
  document_id: string
  user_id: string
  job_type: string
  attempts: number
}

/**
 * Background job processor for PDF documents
 * This endpoint processes queued jobs and should be called by:
 * 1. Vercel Cron Jobs (every minute)
 * 2. Manual trigger for testing
 * 3. Webhook after upload (if using external queue)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow both GET (for cron) and POST (for manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Basic security: check for a secret token to prevent abuse
  const authToken = req.headers.authorization || req.query.token
  if (authToken !== `Bearer ${process.env.CRON_SECRET}` && authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const config = getConfig()
  const supabase = createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  const processingResults = []
  const maxJobs = 3 // Process up to 3 jobs per invocation to avoid timeout

  try {
    for (let i = 0; i < maxJobs; i++) {
      // Get next pending job
      const { data: jobData, error: jobError } = await supabase
        .rpc('get_next_pending_job')
        .single()

      if (jobError) {
        console.error('Error getting next job:', jobError)
        break
      }

      if (!jobData) {
        // No more jobs to process
        break
      }

      const job = jobData as ProcessingJob
      console.log(`Processing job ${job.id} for document ${job.document_id}`)

      try {
        // Get document details
        const { data: document, error: docError } = await supabase
          .from('documents')
          .select('*')
          .eq('id', job.document_id)
          .single()

        if (docError || !document) {
          throw new Error(`Document not found: ${job.document_id}`)
        }

        // Download file from storage
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('documents')
          .download(document.storage_path)

        if (downloadError || !fileData) {
          throw new Error(`Failed to download file: ${downloadError?.message || 'No file data'}`)
        }

        // Convert blob to buffer
        const arrayBuffer = await fileData.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)

        // Process PDF
        const pdfParser = new PDFParserAgent()
        
        const parseResult = await pdfParser.parseBuffer(fileBuffer, {
          extractTables: true,
          performOCR: false, // Start without OCR for speed
          ocrConfidenceThreshold: 70,
          chunkSize: 4000,
          preserveFormatting: true
        })

        if (!parseResult.success) {
          throw new Error(`PDF parsing failed: ${parseResult.error}`)
        }

        // Store chunks
        if (parseResult.chunks.length > 0) {
          const { error: chunksError } = await supabase
            .from('document_chunks')
            .insert(
              parseResult.chunks.map(chunk => ({
                document_id: document.id,
                user_id: document.user_id,
                chunk_id: chunk.id,
                content: chunk.content || chunk.text,
                page_number: chunk.page_number || chunk.page,
                chunk_type: chunk.type,
                tokens: chunk.tokens,
                metadata: {
                  startY: chunk.startY || 0,
                  endY: chunk.endY || 0
                }
              }))
            )

          if (chunksError) {
            throw new Error(`Failed to store chunks: ${chunksError.message}`)
          }
        }

        // Store tables
        if (parseResult.tables.length > 0) {
          const { error: tablesError } = await supabase
            .from('document_tables')
            .insert(
              parseResult.tables.map(table => ({
                document_id: document.id,
                user_id: document.user_id,
                page_number: table.page,
                table_data: table.rows,
                headers: table.headers,
                position: {
                  x: table.x,
                  y: table.y,
                  width: table.width,
                  height: table.height
                }
              }))
            )

          if (tablesError) {
            throw new Error(`Failed to store tables: ${tablesError.message}`)
          }
        }

        // Update document status
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            extracted_text: parseResult.fullText.slice(0, 1000), // First 1000 chars as preview
            metadata: {
              ...document.metadata,
              parsing: {
                success: true,
                pages: parseResult.pages.length,
                tables: parseResult.tables.length,
                chunks: parseResult.chunks.length,
                processingTime: parseResult.processingTime,
                processedAt: new Date().toISOString()
              }
            }
          })
          .eq('id', document.id)

        if (updateError) {
          console.error('Failed to update document status:', updateError)
        }

        // Mark job as completed
        await supabase.rpc('complete_processing_job', {
          p_job_id: job.id,
          p_success: true,
          p_error_message: null
        })

        // Clean up parser resources
        await pdfParser.cleanup()

        processingResults.push({
          jobId: job.id,
          documentId: job.document_id,
          status: 'completed',
          chunks: parseResult.chunks.length,
          tables: parseResult.tables.length,
          processingTime: parseResult.processingTime
        })

        console.log(`✅ Completed job ${job.id}: ${parseResult.chunks.length} chunks, ${parseResult.tables.length} tables`)

      } catch (error) {
        console.error(`❌ Job ${job.id} failed:`, error)

        // Mark job as failed
        await supabase.rpc('complete_processing_job', {
          p_job_id: job.id,
          p_success: false,
          p_error_message: error instanceof Error ? error.message : 'Unknown error'
        })

        // Update document status to error
        await supabase
          .from('documents')
          .update({
            status: 'error',
            metadata: {
              ...{}, // Default empty metadata if none exists
              processingError: error instanceof Error ? error.message : 'Unknown error',
              failedAt: new Date().toISOString()
            }
          })
          .eq('id', job.document_id)

        processingResults.push({
          jobId: job.id,
          documentId: job.document_id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return res.status(200).json({
      success: true,
      processed: processingResults.length,
      results: processingResults
    })

  } catch (error) {
    console.error('Background processor error:', error)
    return res.status(500).json({
      error: 'Processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}