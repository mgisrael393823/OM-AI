import React from 'react'
import { MessageCircle, FileText, Zap, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ChatWelcomeProps {
  onStartChat: () => void
  hasDocuments: boolean
  onUploadDocument?: () => void
}

export function ChatWelcome({ onStartChat, hasDocuments, onUploadDocument }: ChatWelcomeProps) {
  const suggestions = [
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Analyze a Document",
      description: "Upload an offering memorandum or investment document for AI analysis",
      action: onUploadDocument,
      disabled: !onUploadDocument
    },
    {
      icon: <MessageCircle className="h-5 w-5" />,
      title: "Ask a Question",
      description: "Start a conversation about commercial real estate or investments",
      action: onStartChat
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Quick Analysis",
      description: "Get insights on market trends, deal structures, or investment metrics",
      action: onStartChat
    }
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full w-full px-4 sm:px-6 py-6 sm:py-12">
      <div className="max-w-full sm:max-w-2xl mx-auto text-center space-y-6 sm:space-y-8">
        {/* Welcome Header */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-primary/10 rounded-full">
            <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome to OM Intel Chat
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-sm sm:max-w-lg mx-auto">
            Your AI-powered assistant for commercial real estate analysis and investment insights
          </p>
        </div>

        {/* Responsive Action Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {suggestions.map((suggestion, index) => (
            <Card
              key={index}
              className={`p-4 sm:p-6 transition-all duration-200 hover:shadow-md cursor-pointer group ${
                suggestion.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/30'
              }`}
              onClick={suggestion.disabled ? undefined : suggestion.action}
            >
              <div className="space-y-2 sm:space-y-3">
                <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${
                  suggestion.disabled ? 'bg-muted' : 'bg-primary/10 group-hover:bg-primary/20'
                } transition-colors`}>
                  <div className={suggestion.disabled ? 'text-muted-foreground' : 'text-primary'}>
                    {React.cloneElement(suggestion.icon as React.ReactElement, {
                      className: 'h-4 w-4 sm:h-5 sm:w-5'
                    })}
                  </div>
                </div>
                <h3 className="font-semibold text-sm sm:text-base">{suggestion.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {suggestion.description}
                </p>
              </div>
            </Card>
          ))}
        </div>

        {/* Responsive Quick Start */}
        <div className="space-y-3 sm:space-y-4">
          <div className="text-xs sm:text-sm text-muted-foreground">
            Or start with a sample question:
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center max-w-3xl mx-auto">
            {[
              "Key office building metrics?",
              "Explain cap rates",
              "Analyze cash flow projections"
            ].map((question, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="text-xs px-3 py-2 h-auto whitespace-nowrap touch-manipulation"
                onClick={() => {
                  // You could pass this question to the chat input
                  onStartChat()
                }}
              >
                {question}
              </Button>
            ))}
          </div>
        </div>

        {/* Status */}
        {hasDocuments && (
          <div className="text-xs sm:text-sm text-muted-foreground bg-muted/30 rounded-lg p-3 max-w-md mx-auto">
            📄 You have documents ready for analysis. Ask me anything about them!
          </div>
        )}
      </div>
    </div>
  )
}