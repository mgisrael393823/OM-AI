import React, { useState, useMemo } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { 
  Bot, 
  User, 
  Copy, 
  Check,
  MoreHorizontal 
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  timestamp: Date | string
  isLoading?: boolean
  isGrouped?: boolean
  onCopy?: () => void
}

export function MessageBubble({ 
  role, 
  content, 
  timestamp, 
  isLoading = false,
  isGrouped = false,
  onCopy 
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)

  // Memoize formatter to avoid recreation on every render
  const timeFormatter = useMemo(() => 
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }), []
  )

  const handleCopy = async () => {
    // Check clipboard API availability
    if (!navigator.clipboard) {
      console.warn('Clipboard API not available')
      return
    }

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy message:', error)
    }
  }

  const formatTime = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return timeFormatter.format(dateObj)
  }
  const isUser = role === "user"

  return (
    <div 
      className={`group grid items-start animate-slideInUp ${
        isUser ? 'grid-cols-[1fr_auto] justify-items-end' : 'grid-cols-[auto_1fr]'
      } gap-3`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar - Hide if grouped */}
      {!isGrouped && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback 
            className={isUser ? "chat-avatar-user" : "chat-avatar-assistant"}
          >
            {isUser ? (
              <User className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Bot className="h-4 w-4" aria-hidden="true" />
            )}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Spacer for grouped messages */}
      {isGrouped && <div className="h-8 w-8 flex-shrink-0" />}

      {/* Message Content */}
      <div className={`grid grid-rows-[auto_auto] ${isUser ? 'justify-items-end' : 'justify-items-start'} w-full max-w-4xl min-w-0 gap-1`}>
        {/* Message Bubble */}
        <div 
          className={`
            relative px-4 py-3 rounded-2xl w-full max-w-full min-w-0
            ${isUser 
              ? 'chat-bubble-user rounded-br-md' 
              : 'chat-bubble-assistant rounded-bl-md'
            }
          `}
          role="article"
          aria-label={`${isUser ? 'User' : 'Assistant'} message`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </p>
          
          {/* Loading indicator for streaming */}
          {isLoading && !isUser && (
            <div className="grid grid-cols-[auto_auto] items-center gap-2 mt-2" aria-live="polite">
              <div className="animate-pulse grid grid-cols-3 gap-1" role="status" aria-label="AI is thinking">
                <div className="w-2 h-2 bg-current rounded-full opacity-40"></div>
                <div className="w-2 h-2 bg-current rounded-full opacity-60 animation-delay-200"></div>
                <div className="w-2 h-2 bg-current rounded-full opacity-80 animation-delay-400"></div>
              </div>
              <span className="text-xs opacity-70">Thinking...</span>
            </div>
          )}
        </div>

        {/* Timestamp and Actions - Only show for non-grouped messages */}
        {!isGrouped && (
          <div className={`grid items-center gap-2 ${isUser ? 'grid-cols-[auto_auto] justify-items-end' : 'grid-cols-[auto_auto]'}`}>
            <time className="chat-timestamp" dateTime={typeof timestamp === 'string' ? timestamp : timestamp.toISOString()}>
              {formatTime(timestamp)}
            </time>
            
            {/* Message Actions */}
            {(showActions || copied) && (
              <div className="grid grid-cols-2 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-70 hover:opacity-100"
                  onClick={handleCopy}
                  aria-label="Copy message"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                </Button>
                
                {/* More actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-70 hover:opacity-100"
                      aria-label="More message actions"
                    >
                      <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isUser ? "end" : "start"}>
                    <DropdownMenuItem onClick={handleCopy}>
                      <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                      Copy message
                    </DropdownMenuItem>
                    {!isUser && (
                      <DropdownMenuItem disabled>
                        <Bot className="h-4 w-4 mr-2" aria-hidden="true" />
                        Regenerate (Coming soon)
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}