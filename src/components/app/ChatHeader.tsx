import React from 'react'
import { Button } from '@/components/ui/button'
import { Menu, FileText } from 'lucide-react'
import { componentTypography } from '@/lib/typography'
import { ChatSession } from './types'

interface ChatHeaderProps {
  currentSessionId: string | null
  chatSessions: ChatSession[]
  onToggleSidebar: () => void
  onShowUpload: () => void
}

export function ChatHeader({
  currentSessionId,
  chatSessions,
  onToggleSidebar,
  onShowUpload
}: ChatHeaderProps) {
  const currentSession = currentSessionId 
    ? chatSessions.find(s => s.id === currentSessionId)
    : null
    
  const chatTitle = currentSession?.title || 'New Chat'

  return (
    <header className="flex items-center justify-between px-4 h-14 border-b bg-background">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          className="h-10 w-10 p-0 hover:bg-muted rounded md:hidden touch-manipulation"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Current Chat Title - Center */}
      <div className="flex-1 flex justify-center">
        <h1 className={`text-foreground truncate max-w-md ${componentTypography.chat.title}`}>
          {chatTitle}
        </h1>
      </div>

      {/* Documents Button - Minimal */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowUpload}
          className="h-8 w-8 p-0 hover:bg-muted rounded"
          title="Documents"
        >
          <FileText className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
