import React, { useState, useEffect, useRef, useCallback } from "react"
import Head from "next/head"
import { useRouter } from "next/router"
import { Button } from "@/components/ui/button"
import { X, Loader2 } from "lucide-react"
import { useChatPersistent } from "@/hooks/useChatPersistent"
import { useSidebar } from "@/hooks/useSidebar"
import { DocumentUpload } from "@/components/app/DocumentUpload"
import { ChatHeader } from "@/components/app/ChatHeader"
import { ChatSidebar } from "@/components/app/ChatSidebar"
import { ChatMessages } from "@/components/app/ChatMessages"
import { ChatInput } from "@/components/app/ChatInput"
import { ScrollToBottom } from "@/components/ui/scroll-to-bottom"
import { useAuth } from "@/contexts/AuthContext"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { componentTypography } from "@/lib/typography"


export default function AppPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  
  
  // Simple sidebar state management
  const {
    isOpen: sidebarOpen,
    setIsOpen: setSidebarOpen
  } = useSidebar()
  
  const [message, setMessage] = useState("")
  const [showUpload, setShowUpload] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedDocumentName, setSelectedDocumentName] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  const { 
    messages, 
    chatSessions, 
    currentSessionId,
    isLoading, 
    isLoadingHistory,
    sendMessage, 
    createNewChat,
    loadChatSession,
    deleteChatSession,
    renameChatSession
  } = useChatPersistent(selectedDocumentId)

  // Handle review upload button click
  const handleReviewUpload = useCallback((docId: string) => {
    const reviewMessage = "Please review this upload and provide a summary of the key information."
    sendMessage(reviewMessage, null, [docId])
    setShowUpload(false) // Close upload panel
  }, [sendMessage])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])


  // Auto-scroll to bottom when new messages arrive, but only if user is already at bottom
  useEffect(() => {
    if (!messagesEndRef.current || !scrollContainerRef.current) return
    
    const scrollContainer = scrollContainerRef.current
    
    // Check if user is already near the bottom (within 100px)
    const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100
    
    // Only auto-scroll if user is already near bottom
    if (isNearBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])


  // Handle escape key to close sidebar on mobile
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [sidebarOpen, setSidebarOpen])


  // Show loading until authenticated and profile loaded
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-sm text-gray-500">
            {loading ? 'Loading your workspace...' : 'Authenticating...'}
          </p>
        </div>
      </div>
    )
  }

  // Get user display data
  const userDisplayData = {
    name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
    email: user.email || "user@example.com",
    plan: 'Starter'
  }

  const handleSendMessage = async () => {
    if (message.trim() && !isLoading) {
      const messageToSend = message
      setMessage("")
      await sendMessage(messageToSend, selectedDocumentId)
    }
  }

  const handleNewChat = () => {
    createNewChat()
  }

  const handleRemoveDocument = () => {
    setSelectedDocumentId(null)
    setSelectedDocumentName(null)
  }

  const handleStartChat = () => {
    // Focus input or trigger suggested message
    const input = document.querySelector('textarea')
    input?.focus()
  }

  return (
    <ErrorBoundary>
      <Head>
        <title>OM Intel Chat</title>
        <meta name="description" content="AI-powered commercial real estate analysis" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </Head>

      {/* Fully Responsive Layout Container */}
      <div 
        className="h-screen max-h-screen bg-background text-foreground overflow-hidden flex transition-all duration-300"
        style={{ 
          height: '100dvh', // Dynamic viewport height for mobile browsers
          maxHeight: '100dvh'
        }}
      >
        {/* Sidebar */}
        <ChatSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          chatSessions={chatSessions}
          currentSessionId={currentSessionId}
          isLoadingHistory={isLoadingHistory}
          userData={userDisplayData}
          onNewChat={handleNewChat}
          onSelectSession={loadChatSession}
          onDeleteSession={deleteChatSession}
          onRenameSession={renameChatSession}
        />

        {/* Mobile Overlay Backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        {/* Main Content */}
        <div className="flex flex-col h-full flex-1">
          {/* Header */}
          <ChatHeader
            currentSessionId={currentSessionId}
            chatSessions={chatSessions}
            onToggleSidebar={() => setSidebarOpen(true)}
            onShowUpload={() => setShowUpload(true)}
          />


          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages Container */}
            <ChatMessages
              ref={scrollContainerRef}
              messages={messages}
              isLoading={isLoading}
              userInitials={userDisplayData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              onStartChat={handleStartChat}
              onUploadDocument={() => setShowUpload(true)}
              onCopyMessage={(content) => {
                // Optional: Add analytics or toast notification
                console.log('Message copied:', content.slice(0, 50) + '...')
              }}
              hasDocuments={false}
              messagesEndRef={messagesEndRef}
            />

            {/* Responsive Floating Scroll to Bottom Button */}
            <ScrollToBottom
              target={scrollContainerRef}
              threshold={200}
              position="bottom-right"
              offset={{ 
                x: 20, 
                y: 140 
              }}
              showUnreadCount={false}
              size="md"
              variant="default"
              className="shadow-lg"
            />

            {/* Input Area */}
            <ChatInput
              message={message}
              isLoading={isLoading}
              selectedDocumentId={selectedDocumentId}
              selectedDocumentName={selectedDocumentName}
              onMessageChange={setMessage}
              onSendMessage={handleSendMessage}
              onShowUpload={() => setShowUpload(true)}
              onRemoveDocument={handleRemoveDocument}
            />
          </div>
        </div>
      </div>


        {/* Upload Modal */}
        {showUpload && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-gray-900 dark:text-white ${componentTypography.modal.title}`}>
                    Upload Document
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowUpload(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <DocumentUpload 
                  onUploadComplete={(document) => {
                    setShowUpload(false)
                    // Set the uploaded document as selected
                    setSelectedDocumentId(document.docId)
                    setSelectedDocumentName(document.title || 'Document')
                  }}
                  onReviewUpload={handleReviewUpload}
                />
              </div>
            </div>
          </div>
        )}
    </ErrorBoundary>
  )
}
