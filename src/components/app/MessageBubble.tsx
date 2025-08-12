import React from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bot, User } from "lucide-react"
import { componentTypography } from "@/lib/typography"

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
  
  // Safely convert content to string with fallback
  const safeContent = React.useMemo(() => {
    // If content is already a string, return it
    if (typeof content === 'string') {
      return content
    }
    
    // Log warning in development for debugging
    if (process.env.NODE_ENV === 'development' && content !== null && content !== undefined) {
      console.warn('⚠️ MessageBubble received non-string content:', typeof content, content)
    }
    
    // Handle null or undefined
    if (content == null) {
      return ""
    }
    
    // Try to safely convert to string
    try {
      // If it's an object, try to extract meaningful content
      if (typeof content === 'object') {
        const obj = content as any // Safe cast for runtime checks
        // Check for common content fields
        if ('message' in obj && typeof obj.message === 'string') {
          return obj.message
        }
        if ('content' in obj && typeof obj.content === 'string') {
          return obj.content
        }
        if ('text' in obj && typeof obj.text === 'string') {
          return obj.text
        }
        
        // Last resort: stringify the object
        return JSON.stringify(content, null, 2)
      }
      
      // For primitives, convert to string
      return String(content)
    } catch (error) {
      // Fallback for any conversion errors
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error converting content to string:', error)
      }
      return "Error displaying message content"
    }
  }, [content])


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
          ${isLoading && !safeContent ? 'min-w-24' : ''}
          ${isUser 
            ? 'chat-bubble-user rounded-br-md' 
            : 'chat-bubble-assistant rounded-bl-md'
          }
        `}
        role="article"
        aria-label={`${isUser ? 'User' : 'Assistant'} message`}
      >
        <div className="grid grid-cols-1 gap-2">
          <p className={`whitespace-pre-wrap break-words ${componentTypography.chat.message}`}>
            {safeContent}
          </p>
          
          {/* Loading indicator for streaming */}
          {isLoading && !isUser && (
            <div className="grid grid-cols-[auto_auto] items-center gap-2" aria-live="polite">
              <div className="animate-pulse grid grid-cols-3 gap-1" role="status" aria-label="AI is thinking">
                <div className="w-2 h-2 bg-current rounded-full opacity-40"></div>
                <div className="w-2 h-2 bg-current rounded-full opacity-60 animation-delay-200"></div>
                <div className="w-2 h-2 bg-current rounded-full opacity-80 animation-delay-400"></div>
              </div>
              <span className={`opacity-70 ${componentTypography.chat.systemMessage}`}>Thinking...</span>
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