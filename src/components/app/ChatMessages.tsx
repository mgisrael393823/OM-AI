import React, { forwardRef } from 'react'
import { ChatWelcome } from './ChatWelcome'
import { MessageGroup } from './MessageGroup'
import { Message } from './types'

interface ChatMessagesProps {
  messages: Message[]
  isLoading: boolean
  isTyping?: boolean
  isThinking?: boolean
  userInitials: string
  onStartChat: () => void
  onUploadDocument: () => void
  onCopyMessage?: (content: string) => void
  hasDocuments?: boolean
  messagesEndRef?: React.RefObject<HTMLDivElement>
}

type ChatMessagesRef = HTMLDivElement

export const ChatMessages = forwardRef<ChatMessagesRef, ChatMessagesProps>(
  function ChatMessages({
    messages,
    isLoading,
    isTyping = false,
    isThinking = false,
    userInitials,
    onStartChat,
    onUploadDocument,
    onCopyMessage,
    hasDocuments = false,
    messagesEndRef
  }, ref) {
    return (
      <div 
        ref={ref}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto-hide"
      >
        <div className="max-w-3xl mx-auto p-4 sm:p-6 pt-8 pb-24 sm:pb-32">
          {messages.length === 0 ? (
            // Responsive Welcome Screen
            <div className="h-full flex items-center justify-center">
              <ChatWelcome
                onStartChat={onStartChat}
                hasDocuments={hasDocuments}
                onUploadDocument={onUploadDocument}
              />
            </div>
          ) : (
            // Message Thread Container - Grid Layout
            <div className="grid grid-cols-1 justify-items-center w-full min-h-full">
              <div className="grid grid-cols-1 w-full max-w-3xl gap-3">
                <MessageGroup
                  messages={messages}
                  isLoading={isLoading}
                  isTyping={isTyping}
                  isThinking={isThinking}
                  userInitials={userInitials}
                  onCopy={onCopyMessage}
                />
                {/* Scroll anchor for auto-scrolling */}
                <div ref={messagesEndRef} className="h-1" />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
)
