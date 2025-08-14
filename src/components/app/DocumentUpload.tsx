import React, { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle, 
  AlertCircle,
  Loader2
} from "lucide-react"
import { useSupabaseUpload } from "@/hooks/useSupabaseUpload"
import { useInMemoryPDFProcessor } from "@/hooks/useInMemoryPDFProcessor"
import { toast } from "sonner"
import { typography } from "@/lib/typography"

interface UploadFile {
  id: string
  file: File
  progress: number
  status: "uploading" | "processing" | "completed" | "error"
  error?: string
}

interface DocumentUploadProps {
  onUploadComplete?: (document: any) => void
  onDocumentListRefresh?: () => void
}

export function DocumentUpload({ onUploadComplete, onDocumentListRefresh }: DocumentUploadProps) {
  // PDF upload limits
  const MAX_PDF_MB = 100

  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [ingestMode, setIngestMode] = useState<'storage' | 'memory'>(() => {
    // Check environment variable and default to memory mode
    const envMode = process.env.NEXT_PUBLIC_INGEST_MODE
    return envMode === 'memory' ? 'memory' : 'storage'
  })

  const { uploadFile: storageUpload, progress: storageProgress, isUploading: isStorageUploading, error: storageError, reset: resetStorage } = useSupabaseUpload({
    onProgress: (fileName: string, progress: number) => {
      // Update progress for the specific file
      setUploadFiles(prev => prev.map(f => 
        f.file.name === fileName && (f.status === "uploading" || f.status === "processing")
          ? { 
              ...f, 
              progress,
              // Switch to processing when upload reaches 95%
              status: progress >= 95 && progress < 100 ? "processing" : f.status
            }
          : f
      ))
    }
  })

  const { processFile: memoryProcess, progress: memoryProgress, isProcessing, error: memoryError, reset: resetMemory } = useInMemoryPDFProcessor({
    onProgress: (fileName: string, progress: number) => {
      setUploadFiles(prev => prev.map(f => 
        f.file.name === fileName && (f.status === "uploading" || f.status === "processing")
          ? { 
              ...f, 
              progress,
              status: progress >= 60 && progress < 100 ? "processing" : f.status
            }
          : f
      ))
    }
  })

  // Use appropriate values based on mode
  const isUploading = ingestMode === 'memory' ? isProcessing : isStorageUploading
  const globalProgress = ingestMode === 'memory' ? memoryProgress : storageProgress
  const uploadError = ingestMode === 'memory' ? memoryError : storageError
  const reset = ingestMode === 'memory' ? resetMemory : resetStorage

  const uploadWithAuth = useCallback(async (files: File[]) => {
    try {
      // Validate all files first, collect invalids
      const invalidFiles: string[] = []

      files.forEach(file => {
        const isPdf = file.type === 'application/pdf' || 
                      (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
        const isValidSize = file.size <= MAX_PDF_MB * 1024 * 1024
        
        if (!isPdf) {
          invalidFiles.push(`${file.name} (not PDF)`)
        } else if (!isValidSize) {
          invalidFiles.push(`${file.name} (exceeds ${MAX_PDF_MB}MB)`)
        }
      })

      if (invalidFiles.length > 0) {
        toast.error(`${invalidFiles.length} invalid files: ${invalidFiles.join(', ')}`)
        // Don't return - continue with valid files
      }

      // Filter to valid files only
      const validFiles = files.filter(file => {
        const isPdf = file.type === 'application/pdf' || 
                      (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
        return isPdf && file.size <= MAX_PDF_MB * 1024 * 1024
      })

      if (validFiles.length === 0) {
        return // No valid files to process
      }

      // Create upload entries for valid files only
      const newFiles = validFiles.map((file, index) => ({
        id: `upload-${Date.now()}-${index}`,
        file,
        progress: 0,
        status: "uploading" as const
      }))

      setUploadFiles(prev => [...prev, ...newFiles])

      // Process each valid file sequentially
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        const uploadFileEntry = newFiles[i]
        
        try {
          console.log(`Starting ${ingestMode} processing for:`, file.name)
          
          let result: any
          
          if (ingestMode === 'memory') {
            // Use in-memory processing
            result = await memoryProcess(file)
            
            // Transform result to match expected format and store requestId
            const transformedResult = {
              document: {
                id: result.requestId,
                name: result.document.originalFilename,
                filename: result.document.originalFilename,
                size: file.size,
                type: file.type,
                status: 'completed',
                pageCount: result.document.pageCount,
                chunkCount: result.document.chunkCount,
                analysis: result.document.analysis,
                requestId: result.requestId // Store requestId for follow-up queries
              }
            }
            result = transformedResult
            
            // Store requestId in session storage for chat context
            if (typeof window !== 'undefined' && result.requestId) {
              const recentRequestIds = JSON.parse(sessionStorage.getItem('recentRequestIds') || '[]')
              recentRequestIds.unshift(result.requestId)
              // Keep only last 5 request IDs
              sessionStorage.setItem('recentRequestIds', JSON.stringify(recentRequestIds.slice(0, 5)))
            }
          } else {
            // Use storage-based processing
            result = await storageUpload(file)
          }
          
          // Update status to completed
          setUploadFiles(prev => prev.map(f => 
            f.id === uploadFileEntry.id 
              ? { ...f, status: "completed", progress: 100 } 
              : f
          ))
          
          if (onUploadComplete && result.document) {
            onUploadComplete(result.document)
          }
          
          const successMessage = ingestMode === 'memory' 
            ? `${file.name} processed successfully (${result.document.pageCount} pages, ${result.document.chunkCount} chunks)`
            : `${file.name} uploaded successfully`
          
          toast.success(successMessage)
          
          // Refresh document list
          if (onDocumentListRefresh) {
            onDocumentListRefresh()
          }
          
          // Remove from list after 10 seconds
          setTimeout(() => {
            setUploadFiles(prev => prev.filter(f => f.id !== uploadFileEntry.id))
          }, 10000)
          
        } catch (error) {
          console.error(`Processing failed for ${file.name}:`, error)
          
          // Update status to error
          setUploadFiles(prev => prev.map(f => 
            f.id === uploadFileEntry.id 
              ? { ...f, status: "error", error: error instanceof Error ? error.message : "Processing failed" } 
              : f
          ))
          
          toast.error(`Failed to process ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
      }
    } catch (error) {
      console.error("Error starting processing:", error)
      toast.error("Failed to start processing")
    }
  }, [ingestMode, storageUpload, memoryProcess, onUploadComplete, onDocumentListRefresh])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    uploadWithAuth(acceptedFiles)
  }, [uploadWithAuth])

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: MAX_PDF_MB * 1024 * 1024, // Direct storage uploads
    multiple: true,
    disabled: isUploading
  })

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
          }
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-3 text-slate-400" />
        <p className={`${typography.body} text-slate-900 dark:text-white mb-1`}>
          {isDragActive ? "Drop files here" : "Upload PDF documents"}
        </p>
        <p className={`${typography.helper} text-slate-500 dark:text-slate-400`}>
          Drag & drop or click to browse • Max {MAX_PDF_MB}MB per file • Direct storage upload
        </p>
      </div>

      {/* Upload Progress */}
      {uploadFiles.length > 0 && (
        <div className="space-y-3">
          {uploadFiles.map(uploadFile => (
            <div key={uploadFile.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className={`${typography.body} font-medium text-slate-900 dark:text-white truncate`}>
                    {uploadFile.file.name}
                  </span>
                  <span className={`${typography.helper} text-slate-500 flex-shrink-0`}>
                    {(uploadFile.file.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {uploadFile.status === "completed" && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {uploadFile.status === "error" && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  {uploadFile.status === "processing" && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadFile.id)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
              {uploadFile.status === "uploading" && (
                <div className="space-y-1">
                  <Progress value={uploadFile.progress} className="h-1" />
                  <p className={`${typography.helper} text-slate-500`}>
                    Uploading... {uploadFile.progress}%
                  </p>
                </div>
              )}
              
              {uploadFile.status === "processing" && (
                <p className={`${typography.helper} text-blue-600 dark:text-blue-400`}>
                  Processing document...
                </p>
              )}
              
              {uploadFile.status === "completed" && (
                <p className={`${typography.helper} text-green-600 dark:text-green-400`}>
                  Upload completed successfully
                </p>
              )}
              
              {uploadFile.status === "error" && (
                <p className={`${typography.helper} text-red-600 dark:text-red-400`}>
                  {uploadFile.error || "Upload failed"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className={typography.helper}>
          Supported format: PDF • Maximum file size: {MAX_PDF_MB}MB • 
          Text will be extracted automatically for AI analysis • Uploads go directly to storage
        </AlertDescription>
      </Alert>
    </div>
  )
}