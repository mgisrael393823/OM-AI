import React from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bot, User } from "lucide-react"

export interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  isLoading?: boolean
  userInitials?: string
}

export function MessageBubble({ 
  role, 
  content, 
  isLoading = false,
  userInitials = "U"
}: MessageBubbleProps) {
  const isUser = role === "user"


  return (
    <div className={`grid items-start gap-3 animate-slideInUp ${
      isUser 
        ? 'grid-cols-[1fr_auto_auto] justify-items-end' 
        : 'grid-cols-[auto_auto_1fr]'
    }`}>
      
      {/* Avatar - only show for assistant or position for user */}
      {!isUser && (
        <Avatar className="h-6 w-6 mt-1 flex-shrink-0">
          <AvatarFallback className="chat-avatar-assistant text-xs">
            <Bot className="h-3 w-3" />
          </AvatarFallback>
        </Avatar>
      )}
      
      {/* Message Bubble */}
      <div 
        className={`
          relative px-4 py-2 rounded-2xl max-w-[70%] min-w-0
          ${isLoading && !content ? 'min-w-24' : ''}
          ${isUser 
            ? 'chat-bubble-user rounded-br-md' 
            : 'chat-bubble-assistant rounded-bl-md'
          }
        `}
        role="article"
        aria-label={`${isUser ? 'User' : 'Assistant'} message`}
      >
        <div className="grid grid-cols-1 gap-2">
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </p>
          
          {/* Loading indicator for streaming */}
          {isLoading && !isUser && (
            <div className="grid grid-cols-[auto_auto] items-center gap-2" aria-live="polite">
              <div className="animate-pulse grid grid-cols-3 gap-1" role="status" aria-label="AI is thinking">
                <div className="w-2 h-2 bg-current rounded-full opacity-40"></div>
                <div className="w-2 h-2 bg-current rounded-full opacity-60 animation-delay-200"></div>
                <div className="w-2 h-2 bg-current rounded-full opacity-80 animation-delay-400"></div>
              </div>
              <span className="text-xs opacity-70">Thinking...</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Avatar for user messages */}
      {isUser && (
        <Avatar className="h-6 w-6 mt-1 flex-shrink-0">
          <AvatarFallback className="chat-avatar-user text-xs font-medium">
            {userInitials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}