import React, { useCallback, useState, useEffect } from "react"
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
import { useDirectUpload } from "@/hooks/useDirectUpload"
import { toast } from "sonner"
import { typography } from "@/lib/typography"
import { UPLOAD_LIMITS } from "@/lib/constants/upload"

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
  onReviewUpload?: (docId: string) => void
}

export function DocumentUpload({ onUploadComplete, onDocumentListRefresh, onReviewUpload }: DocumentUploadProps) {
  // PDF upload limits - unified across client and server
  const MAX_PDF_MB = UPLOAD_LIMITS.MAX_MB

  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)

  // Load activeDocumentId from sessionStorage on mount (with migration from legacy activeDocId)
  useEffect(() => {
    try {
      // Check for new key first, then migrate from old if needed
      let storedDocId = sessionStorage.getItem('activeDocumentId')
      
      // One-time migration from activeDocId to activeDocumentId
      if (!storedDocId && sessionStorage.getItem('activeDocId')) {
        storedDocId = sessionStorage.getItem('activeDocId')
        if (storedDocId) {
          sessionStorage.setItem('activeDocumentId', storedDocId)
          sessionStorage.removeItem('activeDocId')
          console.log('[DocumentUpload] Migrated activeDocId to activeDocumentId:', storedDocId)
        }
      }
      
      if (storedDocId) {
        setActiveDocumentId(storedDocId)
      }
    } catch (error) {
      console.warn('Failed to load activeDocumentId from sessionStorage:', error)
    }
  }, [])

  const { uploadFile, progress, isUploading, error: uploadError, reset } = useDirectUpload({
    onProgress: (fileName: string, progress: number) => {
      // Update progress for the specific file
      setUploadFiles(prev => prev.map(f => 
        f.file.name === fileName && (f.status === "uploading" || f.status === "processing")
          ? { 
              ...f, 
              progress,
              // Switch to processing when upload reaches 70%
              status: progress >= 70 && progress < 100 ? "processing" : f.status
            }
          : f
      ))
    },
    onUploadComplete: (result) => {
      // Mark as completed
      setUploadFiles(prev => prev.map(f => 
        f.status === "processing" ? { ...f, status: "completed", progress: 100 } : f
      ))
      
      // Store active document ID - use documentId from server response
      // Compatibility: fallback to docId if documentId not present (temporary)
      const documentId = result.documentId || result.docId
      setActiveDocumentId(documentId)
      
      // Call the parent callback
      onUploadComplete?.(result)
      onDocumentListRefresh?.()
    }
  })

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
          console.log(`Starting direct upload processing for:`, file.name)
          
          // Use direct upload with fast processing
          const result = await uploadFile(file)
          
          // Transform result to match expected format
          // Compatibility shim: use documentId if available, fallback to docId
          const uploadDocumentId = result.documentId || result.docId
          const transformedResult = {
            document: {
              id: uploadDocumentId, // Use documentId for document context
              name: file.name,
              filename: file.name,
              size: file.size,
              type: file.type,
              status: result.status === 'complete' ? 'completed' : 'processing',
              pageCount: result.pagesIndexed,
              processingTime: result.processingTime,
              backgroundProcessing: result.backgroundProcessing,
              requestId: uploadDocumentId // Store documentId for follow-up queries
            },
            // Include documentId at top level for parent callback
            documentId: uploadDocumentId,
            title: file.name.replace(/\.pdf$/i, '')
          }
          
          // Store documentId in session storage for chat context
          const recentDocumentId = result.documentId || result.docId
          if (typeof window !== 'undefined' && recentDocumentId) {
            const recentRequestIds = JSON.parse(sessionStorage.getItem('recentRequestIds') || '[]')
            recentRequestIds.unshift(recentDocumentId)
            // Keep only last 5 request IDs
            sessionStorage.setItem('recentRequestIds', JSON.stringify(recentRequestIds.slice(0, 5)))
          }
          
          // Update status to completed (note: this is also handled by the useDirectUpload hook)
          setUploadFiles(prev => prev.map(f => 
            f.id === uploadFileEntry.id 
              ? { ...f, status: "completed", progress: 100 } 
              : f
          ))
          
          // Success message is handled by useDirectUpload hook
          
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
  }, [uploadFile, onUploadComplete, onDocumentListRefresh])

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
          Drag & drop or click to browse - Max {MAX_PDF_MB}MB per file - Direct storage upload
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
                <div className="flex items-center justify-between">
                  <p className={`${typography.helper} text-green-600 dark:text-green-400`}>
                    Upload completed successfully
                  </p>
                  {activeDocumentId && onReviewUpload && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReviewUpload(activeDocumentId)}
                      className="text-xs"
                    >
                      Review Upload
                    </Button>
                  )}
                </div>
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
          Supported format: PDF - Maximum file size: {MAX_PDF_MB}MB - 
          Text will be extracted automatically for AI analysis - Uploads go directly to storage
        </AlertDescription>
      </Alert>
    </div>
  )
}