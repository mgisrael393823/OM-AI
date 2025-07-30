import React from 'react'
import { MessageCircle, FileText, Zap, Sparkles, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { componentTypography, typography } from '@/lib/typography'

interface ChatWelcomeProps {
  onStartChat: () => void
  hasDocuments: boolean
  onUploadDocument?: () => void
}

export function ChatWelcome({ onStartChat, hasDocuments, onUploadDocument }: ChatWelcomeProps) {
  const suggestions = [
    {
      icon: <FileText className="h-4 w-4 text-muted-foreground" />,
      title: "Analyze Document",
      action: onUploadDocument,
      disabled: !onUploadDocument
    },
    {
      icon: <MessageCircle className="h-4 w-4 text-muted-foreground" />,
      title: "Ask Question",
      action: onStartChat
    },
    {
      icon: <Zap className="h-4 w-4 text-muted-foreground" />,
      title: "Quick Analysis",
      action: onStartChat
    }
  ]

  return (
    <div className="grid grid-cols-1 justify-items-center content-center h-full w-full px-4 sm:px-6 py-6 sm:py-12">
      <div className="grid grid-cols-1 justify-items-center text-center gap-4 sm:gap-6 max-w-full sm:max-w-2xl">
        {/* Welcome Header */}
        <div className="grid grid-cols-1 justify-items-center gap-2">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
          <h1 className={`tracking-tight ${typography.sectionHeader} text-xl sm:text-2xl`}>
            Welcome to OM Intel Chat
          </h1>
          <p className={`text-muted-foreground ${typography.body} sm:${typography.bodyLarge}`}>
            AI-powered CRE analysis
          </p>
        </div>

        {/* Compact Action Buttons */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 justify-items-center max-w-2xl">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              disabled={suggestion.disabled}
              onClick={suggestion.disabled ? undefined : suggestion.action}
              className={`grid grid-cols-[auto_1fr] items-center gap-2 px-4 py-2 h-auto transition-colors hover:bg-muted/50 rounded-md ${componentTypography.button.secondary}`}
            >
              {suggestion.icon}
              <span>{suggestion.title}</span>
            </Button>
          ))}
        </div>


        {/* Status */}
        {hasDocuments && (
          <div className="grid grid-cols-1 justify-items-center">
            <div className={`text-muted-foreground bg-muted/30 rounded-lg p-3 max-w-md ${typography.bodySmall} sm:${typography.body}`}>
              📄 You have documents ready for analysis. Ask me anything about them!
            </div>
          </div>
        )}
      </div>
    </div>
  )
}