import React, { useState, useEffect, useRef, useCallback } from "react"
import Head from "next/head"
import { useRouter } from "next/router"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  Building2, 
  Settings, 
  Menu,
  X,
  Plus,
  Send,
  FileText,
  Bot,
  User,
  Loader2,
  Paperclip,
  ArrowUp
} from "lucide-react"
import { useChatPersistent } from "@/hooks/useChatPersistent"
import { useSidebar } from "@/hooks/useSidebar"
import { DocumentUpload } from "@/components/app/DocumentUpload"
import { MessageBubble } from "@/components/app/MessageBubble"
import { ChatHistory } from "@/components/app/ChatHistory"
import { ChatWelcome } from "@/components/app/ChatWelcome"
import { MessageGroup } from "@/components/app/MessageGroup"
import { ScrollToBottom } from "@/components/ui/scroll-to-bottom"
import { useAuth } from "@/contexts/AuthContext"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { componentTypography, responsiveTypography } from "@/lib/typography"


export default function AppPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  
  
  // Simple sidebar state management
  const {
    isOpen: sidebarOpen,
    setIsOpen: setSidebarOpen,
    toggle: toggleSidebar
  } = useSidebar()
  
  const [message, setMessage] = useState("")
  const [showUpload, setShowUpload] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedDocumentName, setSelectedDocumentName] = useState<string | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  
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


  // Show loading until authenticated
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-sm text-gray-500">
            {loading ? 'Loading...' : 'Authenticating...'}
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleNewChat = () => {
    createNewChat()
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
        {/* Responsive Sidebar Container */}
        <div 
          className={`
            fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out
            md:relative md:z-auto md:translate-x-0 md:transition-none
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            bg-muted/30 border-r border-border
            flex flex-col overflow-hidden h-full
          `}
          ref={sidebarRef}
        >
          {/* Sidebar Content */}
          <div className="flex flex-col h-full px-3 py-3">
          {/* Sidebar Header */}
          <div className="flex-shrink-0 pb-3">
            <div className="flex items-center justify-between min-h-[44px]">
              {/* Brand Section */}
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span className={`text-gray-900 dark:text-white ${componentTypography.sidebar.header}`}>OM Intel Chat</span>
              </div>
              
              {/* Close button for mobile */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(false)}
                className="h-10 w-10 p-0 md:hidden touch-manipulation"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* New Chat Button */}
          <div className="flex-shrink-0 pb-1">
            <Button 
              className={`w-full min-h-[44px] justify-start hover:bg-muted/10 active:bg-muted/20 focus-visible:ring-2 focus-visible:ring-accent transition-colors px-3 ${componentTypography.sidebar.navItem}`}
              variant="ghost"
              onClick={handleNewChat}
            >
              <Plus className="w-5 h-5 mr-2" />
              New Chat
            </Button>
          </div>

          {/* Single Scrollable Content Area - Chat History takes priority */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatHistory
              sessions={chatSessions}
              currentSessionId={currentSessionId}
              isLoading={isLoadingHistory}
              onSelectSession={loadChatSession}
              onDeleteSession={deleteChatSession}
              onRenameSession={renameChatSession}
              isCollapsed={false}
            />
          </div>

          {/* User Profile */}
          <div className="flex-shrink-0 pt-3 border-t border-border">
            <div className="flex items-center gap-3 min-h-[44px]">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                  {userDisplayData.name.split(' ').map((n: string) => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className={`text-gray-900 dark:text-white truncate ${componentTypography.sidebar.userName}`}>
                  {userDisplayData.name}
                </p>
                <p className={componentTypography.sidebar.userPlan}>
                  {userDisplayData.plan}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => router.push('/settings')}
                title="Settings"
                className="h-8 w-8 p-0"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
          </div>
        </div>

        {/* Mobile Overlay Backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        {/* Main Content - Grid column 2 */}
        <div className="flex flex-col h-full flex-1">
          {/* HEADER - ChatGPT Style Minimal */}
          <header className="flex items-center justify-between px-4 h-14 border-b bg-background">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="h-10 w-10 p-0 hover:bg-muted rounded md:hidden touch-manipulation"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Current Chat Title - Center */}
            <div className="flex-1 flex justify-center">
              <h1 className={`text-foreground truncate max-w-md ${componentTypography.chat.title}`}>
                {currentSessionId 
                  ? chatSessions.find(s => s.id === currentSessionId)?.title || 'New Chat'
                  : 'New Chat'
                }
              </h1>
            </div>

            {/* Documents Button - Minimal */}
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpload(true)}
                className="h-8 w-8 p-0 hover:bg-muted rounded"
                title="Documents"
              >
                <FileText className="h-4 w-4" />
              </Button>
            </div>
          </header>


          {/* Fully Responsive Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages Container - Responsive with proper constraints */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto-hide"
            >
              <div className="max-w-3xl mx-auto p-4 sm:p-6 pt-8 pb-24 sm:pb-32">
              {messages.length === 0 ? (
                // Responsive Welcome Screen
                <div className="h-full flex items-center justify-center">
                  <ChatWelcome
                    onStartChat={() => {
                      // Focus input or trigger suggested message
                      const input = document.querySelector('textarea')
                      input?.focus()
                    }}
                    hasDocuments={false}
                    onUploadDocument={() => setShowUpload(true)}
                  />
                </div>
              ) : (
                // Message Thread Container - Grid Layout
                <div className="grid grid-cols-1 justify-items-center w-full min-h-full">
                  <div className="grid grid-cols-1 w-full max-w-3xl gap-3">
                    <MessageGroup
                      messages={messages}
                      isLoading={isLoading}
                      userInitials={userDisplayData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                      onCopy={(content) => {
                        // Optional: Add analytics or toast notification
                        console.log('Message copied:', content.slice(0, 50) + '...')
                      }}
                    />
                    {/* Scroll anchor - this is what messagesEndRef should point to */}
                    <div ref={messagesEndRef} className="h-1" />
                  </div>
                </div>
              )}
              </div>
            </div>

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

            {/* Input Area - Seamless ChatGPT Style */}
            <div 
              className="flex-shrink-0"
              style={{
                paddingBottom: 'env(safe-area-inset-bottom, 0)' // Safe area for devices with home indicator
              }}
            >
              <div className="max-w-3xl mx-auto p-4 sm:p-6">
                {/* Selected Document Indicator */}
                {selectedDocumentId && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-primary/20 backdrop-blur-sm rounded-lg w-fit max-w-xs sm:max-w-md">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className={`text-primary ${componentTypography.form.label} truncate`} title={selectedDocumentName || 'Document attached'}>
                      Attached: {selectedDocumentName || 'Document'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDocumentId(null)
                        setSelectedDocumentName(null)
                      }}
                      className="h-6 w-6 p-0 text-primary hover:text-primary/80"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Input Container */}
                <div className="relative">
                  {/* Scrollbar Clipping Wrapper */}
                  <div className="rounded-3xl overflow-hidden">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onInput={(e) => {
                        // Auto-resize textarea
                        const target = e.target as HTMLTextAreaElement
                        target.style.height = 'auto'
                        const maxHeight = 24 * 8 // 8 rows max
                        target.style.height = `${Math.min(target.scrollHeight, maxHeight)}px`
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Send a message..."
                      className={`
                        w-full resize-none rounded-3xl border border-border bg-white dark:bg-gray-900 shadow-lg 
                        focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all
                        min-h-14 max-h-48 px-4 pt-4 pb-12 leading-6
                        placeholder:text-muted-foreground/70 textarea-custom-scroll
                        ${componentTypography.chat.input}
                      `}
                      disabled={isLoading}
                      rows={1}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'hsl(var(--border)) transparent',
                        scrollbarGutter: 'stable',
                        fontSize: '16px' // Prevent zoom on iOS
                      }}
                    />
                  </div>
                  
                  {/* Attach Button - Bottom Left */}
                  <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowUpload(true)}
                    className="absolute left-3 bottom-3 h-auto px-2 py-1 bg-transparent text-gray-500 hover:text-gray-700 hover:bg-transparent"
                    title="Attach file"
                  >
                    <Paperclip className="h-4 w-4 mr-1" />
                    <span className={componentTypography.button.ghost}>Attach</span>
                  </Button>

                  {/* Send Button - Bottom Right */}
                  <Button 
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isLoading}
                    className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 touch-manipulation"
                    title="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
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
                    setSelectedDocumentId(document.id)
                    setSelectedDocumentName(document.name || document.original_filename || 'Document')
                  }}
                />
              </div>
            </div>
          </div>
        )}
    </ErrorBoundary>
  )
}
