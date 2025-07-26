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
      try {
        console.log("UploadThing middleware: Starting authentication check")
        
        // Get auth token from request headers
        const authHeader = req.headers.get("authorization")
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          console.error("UploadThing middleware: No authorization header or invalid format")
          throw new Error("Unauthorized: Missing or invalid authorization header")
        }

        const token = authHeader.replace("Bearer ", "")
        console.log("UploadThing middleware: Token extracted, verifying with Supabase")
        
        // Verify user with Supabase using service role key for server-side auth
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        const { data: { user }, error } = await supabase.auth.getUser(token)
        
        if (error) {
          console.error("UploadThing middleware: Supabase auth error:", error)
          throw new Error("Authentication failed: Invalid token")
        }
        
        if (!user) {
          console.error("UploadThing middleware: No user found for token")
          throw new Error("Authentication failed: User not found")
        }

        console.log("UploadThing middleware: Authentication successful for user:", user.id)
        
        // Pass user id to onUploadComplete
        return { userId: user.id }
      } catch (err) {
        console.error("UploadThing middleware error:", err)
        // Re-throw with consistent error format
        throw new Error(err instanceof Error ? err.message : "Upload authentication failed")
      }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Upload complete for userId:", metadata.userId)
      console.log("File URL:", file.url)
      
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      try {
        // Fetch the uploaded file from UploadThing
        const response = await fetch(file.url)
        if (!response.ok) {
          throw new Error(`Failed to fetch uploaded file: ${response.statusText}`)
        }
        
        const arrayBuffer = await response.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)
        
        // Validate PDF
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

        // Return document data for client
        return {
          documentId: documentData.id,
          document: {
            id: documentData.id,
            name: documentData.original_filename,
            filename: documentData.filename,
            size: documentData.file_size,
            type: documentData.file_type,
            status: documentData.status,
            uploadedAt: documentData.created_at,
            storagePath: documentData.storage_path,
            validation: {
              isValid: validationResult.isValid,
              warnings: validationResult.warnings,
              metadata: validationResult.metadata
            },
            parsing: parseResult ? {
              success: parseResult.success,
              pages: parseResult.pages.length,
              tables: parseResult.tables.length,
              chunks: parseResult.chunks.length,
              processingTime: parseResult.processingTime,
              error: parseResult.error
            } : null
          }
        }
      } catch (error) {
        console.error('Error in onUploadComplete:', error)
        // Log error but don't throw - UploadThing has already stored the file
        // Consider implementing a retry mechanism or error queue
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          documentId: null as string | null
        }
      }
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter