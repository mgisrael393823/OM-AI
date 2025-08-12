import React from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Paperclip, ArrowUp } from 'lucide-react'
import { DocumentContext } from './DocumentContext'
import { componentTypography } from '@/lib/typography'

interface ChatInputProps {
  message: string
  isLoading: boolean
  selectedDocumentId: string | null
  selectedDocumentName: string | null
  onMessageChange: (message: string) => void
  onSendMessage: () => void
  onShowUpload: () => void
  onRemoveDocument: () => void
}

export function ChatInput({
  message,
  isLoading,
  selectedDocumentId,
  selectedDocumentName,
  onMessageChange,
  onSendMessage,
  onShowUpload,
  onRemoveDocument
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSendMessage()
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    // Auto-resize textarea
    const target = e.target as HTMLTextAreaElement
    target.style.height = 'auto'
    const maxHeight = 24 * 8 // 8 rows max
    target.style.height = `${Math.min(target.scrollHeight, maxHeight)}px`
  }

  return (
    <div 
      className="flex-shrink-0"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0)' // Safe area for devices with home indicator
      }}
    >
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Selected Document Indicator */}
        <DocumentContext
          documentId={selectedDocumentId}
          documentName={selectedDocumentName}
          onRemoveDocument={onRemoveDocument}
        />
        
        {/* Input Container */}
        <div className="relative">
          {/* Scrollbar Clipping Wrapper */}
          <div className="rounded-3xl overflow-hidden">
            <textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              className={`
                w-full resize-none rounded-3xl border border-border bg-white dark:bg-gray-900 shadow-lg 
                focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all
                min-h-14 max-h-48 px-4 pt-4 pb-12 leading-6
                placeholder:text-muted-foreground/70 textarea-custom-scroll
                ${componentTypography.chat.input}
              `}
              disabled={isLoading}
              rows={1}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'hsl(var(--border)) transparent',
                scrollbarGutter: 'stable',
                fontSize: '16px' // Prevent zoom on iOS
              }}
            />
          </div>
          
          {/* Attach Button - Bottom Left */}
          <Button 
            variant="ghost"
            size="sm"
            onClick={onShowUpload}
            className="absolute left-3 bottom-3 h-auto px-2 py-1 bg-transparent text-gray-500 hover:text-gray-700 hover:bg-transparent"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4 mr-1" />
            <span className={componentTypography.button.ghost}>Attach</span>
          </Button>

          {/* Send Button - Bottom Right */}
          <Button 
            size="sm"
            onClick={onSendMessage}
            disabled={!message.trim() || isLoading}
            className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 touch-manipulation"
            title="Send message"
          >
            {isLoading ? (
              <Loader2 className="animate-spin h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
