import { createClient } from '@supabase/supabase-js'
import { PDFParserAgent } from '../src/lib/agents/pdf-parser'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function reprocessMissingDocs() {
  console.log('Starting document reprocessing...\n')
  
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required environment variables:')
    console.error('- NEXT_PUBLIC_SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    process.exit(1)
  }

  // Initialize Supabase client with service role key
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  )

  try {
    // Find documents that need reprocessing
    console.log('Searching for X Tampa OM documents...')
    
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .ilike('original_filename', '%Tampa%')
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Error fetching documents:', fetchError)
      return
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found matching criteria.')
      return
    }

    console.log(`Found ${documents.length} document(s) to reprocess:\n`)

    // Process each document
    for (const doc of documents) {
      console.log('═'.repeat(60))
      console.log(`Processing: ${doc.original_filename}`)
      console.log(`Document ID: ${doc.id}`)
      console.log(`Current status: ${doc.status}`)
      console.log(`Processed at: ${doc.processed_at || 'Never'}`)
      console.log(`Has extracted text: ${!!doc.extracted_text}`)
      
      try {
        // Download the file from storage
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('documents')
          .download(doc.storage_path || doc.filename)

        if (downloadError) {
          console.error(`❌ Failed to download file: ${downloadError.message}`)
          continue
        }

        if (!fileData) {
          console.error('❌ No file data received')
          continue
        }

        console.log(`✅ Downloaded file (${(fileData.size / 1024 / 1024).toFixed(2)} MB)`)

        // Convert blob to buffer
        const arrayBuffer = await fileData.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Initialize PDF parser
        const pdfParser = new PDFParserAgent()

        console.log('Parsing PDF...')
        const parseResult = await pdfParser.parseBuffer(buffer, {
          extractTables: true,
          performOCR: false, // Start without OCR, enable if needed
          ocrConfidenceThreshold: 70,
          chunkSize: 4000, // Keep at 4000 for better table preservation
          preserveFormatting: true
        })

        if (!parseResult.success) {
          console.error(`❌ Parsing failed: ${parseResult.error}`)
          
          // Update document status
          await supabase
            .from('documents')
            .update({
              status: 'failed',
              metadata: {
                ...doc.metadata,
                reprocessingError: parseResult.error,
                reprocessedAt: new Date().toISOString()
              }
            })
            .eq('id', doc.id)
          
          continue
        }

        console.log(`✅ Parsing successful:`)
        console.log(`   - Pages: ${parseResult.pages.length}`)
        console.log(`   - Tables: ${parseResult.tables.length}`)
        console.log(`   - Chunks: ${parseResult.chunks.length}`)
        console.log(`   - Processing time: ${parseResult.processingTime}ms`)

        // Delete existing chunks
        const { error: deleteChunksError } = await supabase
          .from('document_chunks')
          .delete()
          .eq('document_id', doc.id)

        if (deleteChunksError) {
          console.warn('Warning: Failed to delete old chunks:', deleteChunksError.message)
        }

        // Delete existing tables
        const { error: deleteTablesError } = await supabase
          .from('document_tables')
          .delete()
          .eq('document_id', doc.id)

        if (deleteTablesError) {
          console.warn('Warning: Failed to delete old tables:', deleteTablesError.message)
        }

        // Insert new chunks with correct page numbers
        if (parseResult.chunks.length > 0) {
          console.log('Storing chunks...')
          
          // Log first few chunks to verify page numbers
          console.log('\nFirst 3 chunks preview:')
          parseResult.chunks.slice(0, 3).forEach((chunk, i) => {
            console.log(`  Chunk ${i + 1}:`)
            console.log(`    - Page: ${chunk.page_number || chunk.page}`)
            console.log(`    - Type: ${chunk.type}`)
            console.log(`    - Text preview: "${(chunk.text || chunk.content || '').slice(0, 50)}..."`)
          })

          const { error: chunksError, count } = await supabase
            .from('document_chunks')
            .insert(
              parseResult.chunks.map(chunk => ({
                document_id: doc.id,
                user_id: doc.user_id,
                chunk_id: chunk.id,
                content: chunk.content || chunk.text,
                page_number: chunk.page_number || chunk.page,
                chunk_type: chunk.type,
                tokens: chunk.tokens,
                metadata: {
                  startY: chunk.startY,
                  endY: chunk.endY
                }
              }))
            )

          if (chunksError) {
            console.error('❌ Failed to store chunks:', chunksError)
          } else {
            console.log(`✅ Stored ${parseResult.chunks.length} chunks`)
          }
        }

        // Insert new tables
        if (parseResult.tables.length > 0) {
          console.log('Storing tables...')
          
          const { error: tablesError } = await supabase
            .from('document_tables')
            .insert(
              parseResult.tables.map(table => ({
                document_id: doc.id,
                user_id: doc.user_id,
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
            console.error('❌ Failed to store tables:', tablesError)
          } else {
            console.log(`✅ Stored ${parseResult.tables.length} tables`)
          }
        }

        // Update document metadata
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            extracted_text: parseResult.fullText.slice(0, 1000), // Store first 1000 chars as sample
            metadata: {
              ...doc.metadata,
              parsing: {
                success: parseResult.success,
                pages: parseResult.pages.length,
                tables: parseResult.tables.length,
                chunks: parseResult.chunks.length,
                processingTime: parseResult.processingTime,
                reprocessedAt: new Date().toISOString()
              }
            }
          })
          .eq('id', doc.id)

        if (updateError) {
          console.error('❌ Failed to update document metadata:', updateError)
        } else {
          console.log('✅ Document metadata updated')
        }

        // Clean up parser resources
        await pdfParser.cleanup()

        console.log(`\n✨ Successfully reprocessed: ${doc.original_filename}`)
        
        // Verify chunk page numbers
        const { data: verifyChunks } = await supabase
          .from('document_chunks')
          .select('page_number')
          .eq('document_id', doc.id)
          .order('page_number')
          .limit(10)
        
        if (verifyChunks) {
          const uniquePages = [...new Set(verifyChunks.map(c => c.page_number))]
          console.log(`   Unique page numbers in chunks: ${uniquePages.join(', ')}`)
        }

      } catch (error) {
        console.error(`❌ Error processing document:`, error)
        
        // Update document with error status
        await supabase
          .from('documents')
          .update({
            status: 'failed',
            metadata: {
              ...doc.metadata,
              reprocessingError: error instanceof Error ? error.message : 'Unknown error',
              reprocessedAt: new Date().toISOString()
            }
          })
          .eq('id', doc.id)
      }
    }

    console.log('\n' + '═'.repeat(60))
    console.log('Reprocessing complete!')

  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

// Run the script
reprocessMissingDocs()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })