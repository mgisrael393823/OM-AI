import React from 'react'
import { MessageBubble } from './MessageBubble'
import { format, isToday, isYesterday } from 'date-fns'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string | Date
}

interface MessageGroupProps {
  messages: Message[]
  isLoading?: boolean
  onCopy?: (content: string) => void
  userInitials?: string
}

function shouldShowDateSeparator(currentMessage: Message, previousMessage?: Message): boolean {
  if (!previousMessage) return true
  
  const currentDate = typeof currentMessage.timestamp === 'string' ? new Date(currentMessage.timestamp) : currentMessage.timestamp
  const prevDate = typeof previousMessage.timestamp === 'string' ? new Date(previousMessage.timestamp) : previousMessage.timestamp
  
  // Show separator if different day
  return format(currentDate, 'yyyy-MM-dd') !== format(prevDate, 'yyyy-MM-dd')
}

export function MessageGroup({ messages, isLoading = false, onCopy, userInitials = "U" }: MessageGroupProps) {
  if (!messages.length) return null

  return (
    <div className="grid grid-cols-1">
      {messages.map((message, index) => {
        const previousMessage = messages[index - 1]
        const showDateSeparator = shouldShowDateSeparator(message, previousMessage)
        const isLastMessage = index === messages.length - 1
        const showLoading = isLoading && isLastMessage && message.role === 'assistant'

        return (
          <div key={message.id} className="message-container">
            {/* Date Separator */}
            {showDateSeparator && (
              <DateSeparator date={typeof message.timestamp === 'string' ? message.timestamp : message.timestamp.toISOString()} />
            )}
            
            {/* Message */}
            <div className="message-wrapper py-2">
              <MessageBubble
                role={message.role}
                content={message.content}
                isLoading={showLoading}
                userInitials={userInitials}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Enhanced MessageBubble props
export interface EnhancedMessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  isLoading?: boolean
  userInitials?: string
}

// Date separator component
export function DateSeparator({ date }: { date: string }) {
  const messageDate = new Date(date)
  
  let displayText: string
  if (isToday(messageDate)) {
    displayText = 'Today'
  } else if (isYesterday(messageDate)) {
    displayText = 'Yesterday'
  } else {
    displayText = format(messageDate, 'EEEE, MMMM d, yyyy')
  }

  return (
    <div className="grid grid-cols-1 justify-items-center my-6">
      <div className="text-xs font-medium text-muted-foreground bg-background px-3 py-1 rounded-full">
        {displayText}
      </div>
    </div>
  )
}

// Utility function to group messages by date (kept for potential future use)
export function groupMessagesByDate(messages: Message[]): Array<{
  date: string
  messages: Message[]
}> {
  const groups: { [key: string]: Message[] } = {}
  
  messages.forEach(message => {
    const date = format(new Date(message.timestamp), 'yyyy-MM-dd')
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(message)
  })
  
  return Object.entries(groups).map(([date, messages]) => ({
    date,
    messages
  }))
}