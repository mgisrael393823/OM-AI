import React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  MoreVertical,
  Trash2,
  Download
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Document {
  id: string
  name: string
  uploadedAt: string
  status: "uploading" | "processing" | "completed" | "error"
  size: number
}

interface DocumentListProps {
  documents: Document[]
  selectedDocument: string | null
  onSelectDocument: (id: string | null) => void
  onDeleteDocument?: (id: string) => void
  compact?: boolean
}

export function DocumentList({ 
  documents, 
  selectedDocument, 
  onSelectDocument,
  onDeleteDocument,
  compact = false 
}: DocumentListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    // Use a more consistent date format to avoid hydration issues
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date)
  }

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "processing":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
    }
  }

  const getStatusBadge = (status: Document['status']) => {
    switch (status) {
      case "uploading":
        return <Badge variant="secondary" className="text-xs">Uploading</Badge>
      case "processing":
        return <Badge variant="secondary" className="text-xs">Processing</Badge>
      case "completed":
        return <Badge variant="secondary" className="text-xs text-green-700 bg-green-100">Ready</Badge>
      case "error":
        return <Badge variant="destructive" className="text-xs">Error</Badge>
    }
  }

  const handleDelete = (documentId: string, documentName: string) => {
    if (onDeleteDocument && confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`)) {
      onDeleteDocument(documentId)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          No documents uploaded yet
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Upload your first PDF to get started
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${compact ? 'p-0' : 'p-4'}`}>
      {documents.map((document) => (
        <div
          key={document.id}
          className={`
            group relative rounded-lg border p-3 cursor-pointer transition-all
            ${selectedDocument === document.id 
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }
            ${document.status !== 'completed' ? 'opacity-60' : ''}
          `}
          onClick={() => document.status === 'completed' && onSelectDocument(document.id)}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-0.5">
              {getStatusIcon(document.status)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {document.name}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(document.uploadedAt)}
                    </p>
                    <span className="text-xs text-slate-400">•</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {document.size}MB
                    </p>
                  </div>
                </div>
                
                {!compact && (
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(document.status)}
                    
                    {document.status === 'completed' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(document.id, document.name)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
              
              {compact && (
                <div className="mt-1">
                  {getStatusBadge(document.status)}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
