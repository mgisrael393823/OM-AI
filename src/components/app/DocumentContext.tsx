import React from 'react'
import { Button } from '@/components/ui/button'
import { FileText, X } from 'lucide-react'
import { componentTypography } from '@/lib/typography'

interface DocumentContextProps {
  documentId: string | null
  documentName: string | null
  onRemoveDocument: () => void
}

export function DocumentContext({ 
  documentId, 
  documentName, 
  onRemoveDocument 
}: DocumentContextProps) {
  if (!documentId) {
    return null
  }

  return (
    <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-primary/20 backdrop-blur-sm rounded-lg w-fit max-w-xs sm:max-w-md">
      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
      <span 
        className={`text-primary ${componentTypography.form.label} truncate`} 
        title={documentName || 'Document attached'}
      >
        Attached: {documentName || 'Document'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemoveDocument}
        className="h-6 w-6 p-0 text-primary hover:text-primary/80"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
