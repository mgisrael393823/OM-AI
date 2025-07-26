import React from 'react'
import { MessageBubble } from './MessageBubble'
import { format, isToday, isYesterday, differenceInMinutes } from 'date-fns'

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
}

function formatMessageTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  
  if (isToday(date)) {
    return format(date, 'h:mm a')
  } else if (isYesterday(date)) {
    return `Yesterday ${format(date, 'h:mm a')}`
  } else {
    return format(date, 'MMM d, h:mm a')
  }
}

function shouldShowTimestamp(currentMessage: Message, previousMessage?: Message): boolean {
  if (!previousMessage) return true
  
  // Show timestamp if role changes
  if (currentMessage.role !== previousMessage.role) return true
  
  // Show timestamp if more than 5 minutes apart
  const currentDate = typeof currentMessage.timestamp === 'string' ? new Date(currentMessage.timestamp) : currentMessage.timestamp
  const prevDate = typeof previousMessage.timestamp === 'string' ? new Date(previousMessage.timestamp) : previousMessage.timestamp
  const timeDiff = differenceInMinutes(currentDate, prevDate)
  
  return timeDiff > 5
}

function shouldGroupMessages(currentMessage: Message, previousMessage?: Message): boolean {
  if (!previousMessage) return false
  
  // Group if same role and within 1 minute
  if (currentMessage.role !== previousMessage.role) return false
  
  const currentDate = typeof currentMessage.timestamp === 'string' ? new Date(currentMessage.timestamp) : currentMessage.timestamp
  const prevDate = typeof previousMessage.timestamp === 'string' ? new Date(previousMessage.timestamp) : previousMessage.timestamp
  const timeDiff = differenceInMinutes(currentDate, prevDate)
  
  return timeDiff <= 1
}

export function MessageGroup({ messages, isLoading = false, onCopy }: MessageGroupProps) {
  if (!messages.length) return null

  return (
    <div className="grid grid-cols-1 gap-3">
      {messages.map((message, index) => {
        const previousMessage = messages[index - 1]
        const isGrouped = shouldGroupMessages(message, previousMessage)
        const isLastMessage = index === messages.length - 1
        const showLoading = isLoading && isLastMessage && message.role === 'assistant'

        return (
          <div key={message.id} className="message-container">
            {/* Message */}
            <div className="message-wrapper grid grid-cols-1">
              <MessageBubble
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                isLoading={showLoading}
                isGrouped={isGrouped}
                onCopy={() => onCopy?.(message.content)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Enhanced MessageBubble props for grouping
export interface EnhancedMessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  isLoading?: boolean
  isGrouped?: boolean
  onCopy?: () => void
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
    <div className="grid grid-cols-1 justify-items-center my-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 w-full max-w-lg">
        <div className="h-px bg-border" />
        <div className="text-sm font-medium text-muted-foreground bg-background px-4 py-2 rounded-full border">
          {displayText}
        </div>
        <div className="h-px bg-border" />
      </div>
    </div>
  )
}

// Utility function to group messages by date
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