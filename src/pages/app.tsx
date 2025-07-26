import React, { useState, useEffect, useRef, useCallback } from "react"
import Head from "next/head"
import { useRouter } from "next/router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Building2, 
  MessageSquare, 
  Settings, 
  Menu,
  X,
  Plus,
  Send,
  FileText,
  Bot,
  User,
  Mic,
  Paperclip,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ExternalLink,
  Eye
} from "lucide-react"
import { useDrag } from '@use-gesture/react'
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"

interface Document {
  id: string
  name: string
  uploadedAt: string
  status: "uploading" | "processing" | "completed" | "error"
  size: number
}

export default function AppPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  
  // Debug logging for auth state
  useEffect(() => {
    console.log('📱 App Page - Auth State:', { 
      loading, 
      hasUser: !!user, 
      userEmail: user?.email 
    })
  }, [loading, user])
  
  // Responsive sidebar state management
  const {
    sidebarState,
    sidebarOpen,
    deviceType,
    setSidebarState,
    setSidebarOpen,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
    isMobile,
    isTablet,
    isDesktop,
    sidebarWidth
  } = useSidebar()
  
  const [message, setMessage] = useState("")
  const [showUpload, setShowUpload] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [showAllDocuments, setShowAllDocuments] = useState(false)
  const [documentsAccordionValue, setDocumentsAccordionValue] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
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
    console.log('🔄 Checking auth redirect:', { loading, hasUser: !!user })
    if (!loading && !user) {
      console.log('❌ No user, redirecting to login')
      router.push('/auth/login')
    } else if (!loading && user) {
      console.log('✅ User authenticated, staying on app page')
    }
  }, [user, loading, router])

  // Fetch user documents
  const fetchDocuments = React.useCallback(async (): Promise<void> => {
    if (!user) return
    
    setIsLoadingDocuments(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No session token available - please log in again')
      }

      const response = await fetch(`${window.location.origin}/api/documents`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Failed to fetch documents: ${response.status} ${response.statusText}. ${errorData}`)
      }
      
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
      // Re-throw to let ErrorBoundary catch critical errors
      if (error instanceof Error && error.message.includes('No session token')) {
        throw error
      }
      // For other errors, just log them and continue
    } finally {
      setIsLoadingDocuments(false)
    }
  }, [user])

  // Load documents when user is authenticated
  useEffect(() => {
    if (user) {
      fetchDocuments()
    }
  }, [user])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Swipe gesture handling for mobile
  const bind = useDrag(
    ({ down, movement: [mx], direction: [dx], distance, cancel, last }) => {
      if (!isMobile || !sidebarOpen) return

      if (dx > 0 || (Array.isArray(distance) ? distance[0] : distance) < 50) {
        if (last) cancel?.()
        return
      }

      if (last && mx < -100) {
        setSidebarOpen(false)
      }
    },
    {
      axis: 'x',
      threshold: 10,
      filterTaps: true,
      preventScroll: true
    }
  )

  // Focus management for accessibility
  useEffect(() => {
    if (!isMobile && !isTablet) return
    if (sidebarOpen && sidebarRef.current) {
      const firstFocusable = sidebarRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement
      if (firstFocusable) {
        firstFocusable.focus()
      }
    }
  }, [sidebarOpen, isMobile, isTablet])

  // Handle escape key to close sidebar on mobile & tablet
  useEffect(() => {
    if (!isMobile && !isTablet) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [sidebarOpen, isMobile, isTablet, setSidebarOpen])

  // Optimized status icon function to prevent unnecessary re-renders
  const getStatusIcon = useCallback((status: Document['status']) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      case "processing":
        return <Clock className="h-3 w-3 text-yellow-500" />
      case "completed":
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case "error":
        return <AlertCircle className="h-3 w-3 text-red-500" />
    }
  }, [])

  // Show loading until authenticated
  if (loading || !user) {
    console.log('⏳ Showing loading screen:', { loading, hasUser: !!user })
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
        className={`
          h-screen max-h-screen bg-background text-foreground overflow-hidden flex
          ${isDesktop ? 'transition-all duration-300' : ''}
        `}
        style={{ 
          height: '100dvh', // Dynamic viewport height for mobile browsers
          maxHeight: '100dvh'
        }}
      >
        {/* Responsive Sidebar Container */}
        <div className={`
          ${isMobile 
            ? `fixed inset-y-0 left-0 z-50 w-full max-w-xs sm:max-w-sm transform transition-transform duration-300 ease-in-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : isTablet
            ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : `relative flex-shrink-0 transition-all duration-300 ease-in-out`
          }
          bg-muted/30 border-r border-border
          flex flex-col overflow-hidden
          h-full
        `}
        style={{
          width: isMobile 
            ? '100%' 
            : isTablet
            ? `${sidebarWidth}px` // Fixed width for tablet overlay
            : sidebarOpen || isDesktop 
            ? `${sidebarWidth}px` // Use fixed pixel widths from SIDEBAR_WIDTHS constants
            : '0px'
        }}
        ref={sidebarRef}
        {...(isMobile ? bind() : {})}
        >
          {/* Sidebar Content */}
          <div className={`
            flex flex-col h-full
            ${sidebarState === 'collapsed' && !isMobile && !isTablet ? 'items-center' : ''}
          `}>
          {/* Sidebar Header - Grid Layout */}
          <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-[1fr_auto] items-center">
              {/* Brand Section */}
              <div className={`grid ${sidebarState === 'collapsed' && !isMobile && !isTablet ? 'grid-cols-1 justify-items-center' : 'grid-cols-[auto_1fr] gap-2'} items-center`}>
                <Building2 className="h-6 w-6 text-blue-600" />
                {(sidebarState !== 'collapsed' || isMobile || isTablet) && (
                  <span className="font-semibold text-gray-900 dark:text-white">OM Intel Chat</span>
                )}
              </div>
              
              {/* Controls Section */}
              <div className={`grid gap-1 ${
                isDesktop && sidebarState !== 'collapsed' ? 'grid-cols-2' : 'grid-cols-1'
              }`}>
                {/* Desktop sidebar controls */}
                {isDesktop && sidebarState !== 'collapsed' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarState(sidebarState === 'expanded' ? 'normal' : 'expanded')}
                      title={sidebarState === 'expanded' ? 'Collapse to normal' : 'Expand sidebar'}
                      className="h-7 w-7 p-0"
                    >
                      {sidebarState === 'expanded' ? (
                        <PanelLeftClose className="h-4 w-4" />
                      ) : (
                        <PanelLeftOpen className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarState('collapsed')}
                      title="Collapse sidebar"
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </>
                )}
                
                {/* Collapsed state expand button */}
                {isDesktop && sidebarState === 'collapsed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarState('normal')}
                    title="Expand sidebar"
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Mobile & Tablet close button */}
                {(isMobile || isTablet) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarOpen(false)}
                    className="h-7 w-7 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* New Chat Button - Fixed */}
          <div className="flex-shrink-0 p-4">
            {sidebarState === 'collapsed' && !isMobile && !isTablet ? (
              <Button 
                className="w-full justify-center p-2" 
                variant="outline"
                onClick={handleNewChat}
                title="New Chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={handleNewChat}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            )}
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
            />
          </div>

          {/* Documents Section - Collapsed State (Desktop Only) */}
          {sidebarState === 'collapsed' && !isMobile && !isTablet && documents.length > 0 && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-2">
              <div className="flex flex-col items-center space-y-1">
                {documents.slice(0, 3).map((doc) => (
                  <Button
                    key={doc.id}
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 ${
                      selectedDocumentId === doc.id
                        ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                    onClick={() => {
                      if (doc.status === 'completed') {
                        setSelectedDocumentId(selectedDocumentId === doc.id ? null : doc.id)
                      }
                    }}
                    title={doc.name}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                ))}
                {documents.length > 3 && (
                  <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                    +{documents.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Documents Section - Collapsible Accordion */}
          {(sidebarState !== 'collapsed' || isMobile || isTablet) && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
              <Accordion
                type="single"
                collapsible
                value={documentsAccordionValue}
                onValueChange={setDocumentsAccordionValue}
                className="w-full"
              >
                <AccordionItem value="documents" className="border-0">
                  <AccordionTrigger className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:no-underline">
                    <div className="flex items-center justify-between w-full">
                      <span>Documents</span>
                      <div className="flex items-center space-x-2">
                        {documents.length > 0 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                            {documents.length}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-2">
                    {isLoadingDocuments ? (
                      <div className="py-4 text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-600 mb-2" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Loading documents...
                        </p>
                      </div>
                    ) : documents.length > 0 ? (
                      <div className="grid grid-cols-1 gap-0" role="list">
                        {/* Document Items */}
                        {documents.slice(0, showAllDocuments ? documents.length : 5).map((doc) => (
                          <div
                            key={doc.id}
                            role="listitem"
                            aria-selected={selectedDocumentId === doc.id}
                            className={`group relative p-2 rounded-md cursor-pointer transition-all duration-200 ${
                              selectedDocumentId === doc.id
                                ? 'bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                            } ${
                              doc.status === 'completed' ? '' : 'opacity-60 cursor-not-allowed'
                            }`}
                            onClick={() => {
                              if (doc.status === 'completed') {
                                setSelectedDocumentId(selectedDocumentId === doc.id ? null : doc.id)
                              }
                            }}
                          >
                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                              {/* Icon Column */}
                              <FileText className={`h-3.5 w-3.5 ${
                                selectedDocumentId === doc.id ? 'text-blue-600' : 'text-gray-400'
                              }`} />
                              
                              {/* Content Column */}
                              <div className="grid grid-rows-2 gap-0 min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                  {doc.name}
                                </p>
                                <div className="grid grid-cols-[auto_auto_1fr] items-center gap-2">
                                  {getStatusIcon(doc.status)}
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {doc.size}MB
                                  </p>
                                  {selectedDocumentId === doc.id && (
                                    <span className="text-xs text-blue-600 font-medium">Active</span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Actions Column */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // TODO: Open document preview
                                  }}
                                  title="Preview document"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* View All / Show Less Toggle */}
                        {documents.length > 5 && (
                          <div className="grid grid-cols-1 p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              onClick={() => setShowAllDocuments(!showAllDocuments)}
                            >
                              <div className="grid grid-cols-[auto_1fr] items-center gap-1">
                                {showAllDocuments ? (
                                  <>
                                    <ChevronDown className="h-3 w-3 rotate-180" />
                                    <span>Show Less</span>
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="h-3 w-3" />
                                    <span>View All ({documents.length})</span>
                                  </>
                                )}
                              </div>
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 justify-items-center p-4 gap-2">
                        <FileText className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          No documents yet
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-blue-600"
                          onClick={() => setShowUpload(true)}
                        >
                          <div className="grid grid-cols-[auto_1fr] items-center gap-1">
                            <Plus className="h-3 w-3" />
                            <span>Upload Document</span>
                          </div>
                        </Button>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          {/* User Profile - Grid Layout */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
            {sidebarState === 'collapsed' && !isMobile && !isTablet ? (
              /* Collapsed view - Centered Grid */
              <div className="grid grid-cols-1 justify-items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                    {userDisplayData.name.split(' ').map((n: string) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => router.push('/settings')}
                  title="Settings"
                  className="h-8 w-8 p-0"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              /* Normal/expanded view - Three Column Grid */
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                    {userDisplayData.name.split(' ').map((n: string) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="grid grid-rows-2 gap-0 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {userDisplayData.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
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
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Mobile & Tablet Overlay Backdrop */}
        {(isMobile || isTablet) && sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
            onTouchStart={(e) => {
              // Prevent scroll on body when overlay is touched
              document.body.style.overflow = 'hidden'
            }}
            onTouchEnd={() => {
              document.body.style.overflow = ''
            }}
            aria-label="Close sidebar"
          />
        )}

        {/* Main Content - Grid column 2 */}
        <div className="flex flex-col overflow-hidden flex-1">
          {/* Mobile Header */}
          {isMobile && (
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <span className="font-semibold text-gray-900 dark:text-white">OM Intel Chat</span>
              <div className="w-8" /> {/* Spacer */}
            </div>
          )}
          
          {/* Tablet Header with sidebar toggle */}
          {isTablet && (
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <span className="font-semibold text-gray-900 dark:text-white">OM Intel Chat</span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/settings')}
                  title="Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Selected Document Header */}
          {selectedDocumentId && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2 text-sm">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-blue-900 dark:text-blue-100 font-medium">
                  Analyzing: {documents.find(d => d.id === selectedDocumentId)?.name || 'Selected Document'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDocumentId(null)}
                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Fully Responsive Chat Area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {/* Messages Container - Responsive with proper constraints */}
            <div className="flex-1 relative">
              <div 
                ref={messagesEndRef}
                className="h-full overflow-y-auto overflow-x-hidden scrollbar-auto-hide"
                style={{ 
                  paddingBottom: 'clamp(80px, 15vh, 140px)', // Responsive bottom padding
                  paddingTop: 'env(safe-area-inset-top, 0)' // Safe area for notched devices
                }}
              >
                {messages.length === 0 ? (
                  // Responsive Welcome Screen
                  <div className="h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
                    <ChatWelcome
                      onStartChat={() => {
                        // Focus input or trigger suggested message
                        const input = document.querySelector('textarea')
                        input?.focus()
                      }}
                      hasDocuments={documents.length > 0}
                      onUploadDocument={() => setShowUpload(true)}
                    />
                  </div>
                ) : (
                  // Message Thread Container - Grid Layout
                  <div className="grid grid-cols-1 justify-items-center w-full min-h-full p-4">
                    <div className="grid grid-cols-1 w-full max-w-3xl gap-3">
                      <MessageGroup
                        messages={messages}
                        isLoading={isLoading}
                        onCopy={(content) => {
                          // Optional: Add analytics or toast notification
                          console.log('Message copied:', content.slice(0, 50) + '...')
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Responsive Floating Scroll to Bottom Button */}
              <ScrollToBottom
                target={messagesEndRef}
                threshold={200}
                position="bottom-right"
                offset={{ 
                  x: isMobile ? 16 : 24, 
                  y: isMobile ? 120 : 140 
                }}
                showUnreadCount={false}
                size={isMobile ? "sm" : "md"}
                variant="default"
                className="shadow-lg"
              />
            </div>

            {/* Input Area - Grid Layout */}
            <div 
              className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border"
              style={{
                paddingBottom: 'env(safe-area-inset-bottom, 0)' // Safe area for devices with home indicator
              }}
            >
              <div className="grid grid-cols-1 justify-items-center p-4">
                <div className="grid grid-cols-1 w-full max-w-3xl gap-2">
                  {/* Input Row */}
                  <div className="grid grid-cols-1 relative">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder={isMobile 
                        ? "Ask anything..." 
                        : "Ask anything about commercial real estate..."
                      }
                      className="
                        w-full resize-none rounded-2xl border border-border bg-background shadow-sm 
                        focus:ring-2 focus:ring-primary focus:border-transparent transition-all
                        min-h-[56px] max-h-[200px] p-4 pr-24 text-base
                      "
                      disabled={isLoading}
                      rows={1}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'hsl(var(--border)) transparent',
                        fontSize: '16px' // Consistent font size to prevent zoom on iOS
                      }}
                    />
                    
                    {/* Input Actions - Absolute Grid */}
                    <div className="absolute right-2 bottom-2">
                      <div className={`grid ${!isMobile ? 'grid-cols-3' : 'grid-cols-2'} gap-1`}>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setShowUpload(true)}
                          title="Upload document"
                          className="h-8 w-8 p-0 hover:bg-muted touch-manipulation"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        {!isMobile && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            title="Voice input"
                            className="h-8 w-8 p-0 hover:bg-muted"
                          >
                            <Mic className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="sm"
                          onClick={handleSendMessage}
                          disabled={!message.trim() || isLoading}
                          className="h-8 w-8 p-0 rounded-lg touch-manipulation"
                          title="Send message"
                        >
                          {isLoading ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Footer Row */}
                  <div className={`grid text-xs text-muted-foreground ${isMobile ? 'grid-cols-1 justify-items-center gap-2' : 'grid-cols-[1fr_auto] items-center'}`}>
                    {!isMobile && (
                      <div>
                        <span>Press Enter to send, Shift + Enter for new line</span>
                      </div>
                    )}
                    <div className={`grid gap-2 ${isMobile ? 'grid-cols-1 justify-items-center' : 'grid-cols-[repeat(auto-fit,_minmax(100px,_auto))]'}`}>
                      {selectedDocumentId && (
                        <div className="grid grid-cols-[auto_1fr] items-center gap-1 p-2 bg-primary/10 rounded-md">
                          <FileText className="h-3 w-3 text-primary" />
                          <span className="text-primary text-xs">
                            {isMobile ? 'Doc' : 'Doc attached'}
                          </span>
                        </div>
                      )}
                      {!isMobile && (
                        <Button variant="ghost" size="sm" className="h-auto p-2 text-xs hover:bg-muted opacity-70">
                          <span>AI can make mistakes. Verify important information.</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button - Mobile Only */}
      {isMobile && !sidebarOpen && (
        <Button
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-30 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open conversations"
          title="Open conversations"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
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
                  // Auto-expand documents accordion after upload
                  setDocumentsAccordionValue('documents')
                }}
                onDocumentListRefresh={fetchDocuments}
              />
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}
