import { createUploadthing, type FileRouter } from "uploadthing/next"
import { createClient } from '@supabase/supabase-js'
import { PDFValidator } from '@/lib/validation'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'

const f = createUploadthing()

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define a file route for PDF uploads
  pdfUploader: f({ pdf: { maxFileSize: "16MB" } })
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      console.log("🚀 UploadThing middleware: CALLED")
      try {
        console.log("UploadThing middleware: Starting authentication check")
        
        // Validate environment variables first
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error("UploadThing middleware: Missing required environment variables")
          throw new Error("Missing required environment variables")
        }
        
        // Get auth token from request headers
        // In v7, headers are in a different format
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
        console.log("UploadThing middleware: Authorization header present:", !!authHeader)
        
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          console.error("UploadThing middleware: Missing or invalid authorization header")
          throw new Error("Unauthorized")
        }

        const token = authHeader.replace("Bearer ", "")
        console.log("UploadThing middleware: Token extracted, length:", token.length)
        
        // Verify user with Supabase using service role key for server-side auth
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
        
        console.log("UploadThing middleware: Verifying token with Supabase...")
        const { data: { user }, error } = await supabase.auth.getUser(token)
        
        if (error) {
          console.error("UploadThing middleware: Supabase auth error:", {
            message: error.message,
            code: error.status
          })
          throw new Error("Authentication failed: " + error.message)
        }
        
        if (!user) {
          console.error("UploadThing middleware: No user found for token")
          throw new Error("User not found")
        }

        console.log("UploadThing middleware: Authentication successful for user:", user.id)
        
        // Pass user id to onUploadComplete
        return { userId: user.id }
      } catch (err) {
        console.error("UploadThing middleware unexpected error:", {
          error: err,
          message: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined
        })
        
        // Re-throw the error for v6
        throw err
      }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const startTime = Date.now()
      
      try {
        console.log("UploadThing onUploadComplete: Starting")
        console.log("UploadThing onUploadComplete: Metadata:", metadata)
        console.log("UploadThing onUploadComplete: File details:", { name: file.name, size: file.size, url: file.url })
        
        // Check if metadata is null (unauthorized)
        if (!metadata || !metadata.userId) {
          console.log("UploadThing onUploadComplete: No metadata/userId, returning unauthorized error")
          throw new Error("Unauthorized: No user ID in metadata")
        }
        
        console.log("UploadThing onUploadComplete: Processing for userId:", metadata.userId)
        
        // Validate environment variables
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error("onUploadComplete error: Missing required Supabase environment variables")
          throw new Error("Missing required Supabase environment variables")
        }
        
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
        // Fetch the uploaded file from UploadThing
        console.log("UploadThing onUploadComplete: Fetching file from URL:", file.url)
        const response = await fetch(file.url)
        if (!response.ok) {
          throw new Error(`Failed to fetch uploaded file: ${response.statusText}`)
        }
        
        const arrayBuffer = await response.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)
        console.log("UploadThing onUploadComplete: File fetched, size:", fileBuffer.length)
        
        // Validate PDF
        console.log("UploadThing onUploadComplete: Starting PDF validation")
        const quickValidation = PDFValidator.quickValidate(fileBuffer, file.name)
        if (!quickValidation.isValid) {
          throw new Error(quickValidation.error || 'Invalid PDF file')
        }

        const validationResult = await PDFValidator.validatePDF(fileBuffer, file.name)
        if (!validationResult.isValid) {
          throw new Error(`PDF validation failed: ${validationResult.errors.join('; ')}`)
        }

        // Generate unique filename for Supabase storage
        const fileExt = file.name.split('.').pop() || 'pdf'
        const fileName = `${metadata.userId}/${file.key}.${fileExt}`

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('documents')
          .upload(fileName, fileBuffer, {
            contentType: 'application/pdf',
            upsert: false
          })

        if (uploadError) {
          console.error('Supabase upload error:', uploadError)
          throw new Error(`Failed to upload to storage: ${uploadError.message}`)
        }

        // Initialize PDF parser
        const pdfParser = new PDFParserAgent()
        let parseResult = null
        let processingError = null

        try {
          parseResult = await pdfParser.parseBuffer(fileBuffer, {
            extractTables: true,
            performOCR: validationResult.metadata.isEncrypted || !validationResult.metadata.hasText,
            ocrConfidenceThreshold: 70,
            chunkSize: 1000,
            preserveFormatting: true
          })
        } catch (error) {
          console.error('PDF parsing error:', error)
          processingError = error instanceof Error ? error.message : 'Unknown parsing error'
        } finally {
          await pdfParser.cleanup()
        }

        // Save document metadata to database
        const { data: documentData, error: dbError } = await supabase
          .from('documents')
          .insert({
            user_id: metadata.userId,
            filename: fileName,
            original_filename: file.name,
            storage_path: uploadData.path,
            file_size: file.size,
            file_type: 'application/pdf',
            status: parseResult?.success ? 'completed' : 'processing',
            metadata: {
              validation: validationResult,
              parsing: parseResult ? {
                success: parseResult.success,
                pages: parseResult.pages.length,
                tables: parseResult.tables.length,
                chunks: parseResult.chunks.length,
                processingTime: parseResult.processingTime,
                error: parseResult.error
              } : null,
              processingError,
              uploadthing_key: file.key,
              uploadthing_url: file.url
            }
          })
          .select()
          .single()

        if (dbError) {
          console.error('Database error:', dbError)
          // Try to clean up uploaded file
          await supabase.storage.from('documents').remove([fileName])
          throw new Error(`Failed to save document metadata: ${dbError.message}`)
        }

        // Store parsed chunks if successful
        if (parseResult?.success && parseResult.chunks.length > 0) {
          const { error: chunksError } = await supabase
            .from('document_chunks')
            .insert(
              parseResult.chunks.map(chunk => ({
                document_id: documentData.id,
                user_id: metadata.userId,
                chunk_id: chunk.id,
                content: chunk.text,
                page_number: chunk.page,
                chunk_type: chunk.type,
                tokens: chunk.tokens,
                metadata: {
                  startY: chunk.startY,
                  endY: chunk.endY
                }
              }))
            )

          if (chunksError) {
            console.error('Failed to store document chunks:', chunksError)
          }

          // Store extracted tables
          if (parseResult.tables.length > 0) {
            const { error: tablesError } = await supabase
              .from('document_tables')
              .insert(
                parseResult.tables.map(table => ({
                  document_id: documentData.id,
                  user_id: metadata.userId,
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
              console.error('Failed to store document tables:', tablesError)
            }
          }
        }

        console.log("onUploadComplete: Successfully processed document:", documentData.id)
        
        // v7 expects void return from onUploadComplete
        // The document is already saved successfully
        return
      } catch (error) {
        // Log error details
        console.error("UploadThing onUploadComplete error:", {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          userId: metadata?.userId,
          fileName: file?.name
        })
        
        // In v7, throwing an error will properly handle the failure
        throw error
      } finally {
        const executionTime = Date.now() - startTime
        console.log(`UploadThing onUploadComplete: Execution time: ${executionTime}ms`)
      }
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
