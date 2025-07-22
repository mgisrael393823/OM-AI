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

interface UploadFile {
  id: string
  file: File
  progress: number
  status: "uploading" | "processing" | "completed" | "error"
  error?: string
}

export function DocumentUpload() {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`, // More consistent ID generation
      file,
      progress: 0,
      status: "uploading" as const
    }))

    setUploadFiles(prev => [...prev, ...newFiles])

    // Simulate upload process
    newFiles.forEach(uploadFile => {
      simulateUpload(uploadFile.id)
    })
  }, [])

  const simulateUpload = async (fileId: string) => {
    // Simulate upload progress
    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise(resolve => setTimeout(resolve, 200))
      setUploadFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress } : f
      ))
    }

    // Simulate processing
    setUploadFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: "processing" } : f
    ))

    await new Promise(resolve => setTimeout(resolve, 2000))

    // Complete
    setUploadFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: "completed" } : f
    ))

    // Remove from list after 3 seconds
    setTimeout(() => {
      setUploadFiles(prev => prev.filter(f => f.id !== fileId))
    }, 3000)
  }

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true
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
        `}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-3 text-slate-400" />
        <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
          {isDragActive ? "Drop files here" : "Upload PDF documents"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Drag & drop or click to browse • Max 10MB per file
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
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {uploadFile.file.name}
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0">
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
                  <p className="text-xs text-slate-500">
                    Uploading... {uploadFile.progress}%
                  </p>
                </div>
              )}
              
              {uploadFile.status === "processing" && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Processing document...
                </p>
              )}
              
              {uploadFile.status === "completed" && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Upload completed successfully
                </p>
              )}
              
              {uploadFile.status === "error" && (
                <p className="text-xs text-red-600 dark:text-red-400">
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
        <AlertDescription className="text-xs">
          Supported format: PDF • Maximum file size: 10MB • 
          Text will be extracted automatically for AI analysis
        </AlertDescription>
      </Alert>
    </div>
  )
}
