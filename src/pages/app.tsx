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
    if (!loading && !user) {
      router.push('/auth/login')
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

  // Show loading until authenticated
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-sm text-gray-500">Loading...</p>
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

  // Swipe gesture handling for mobile
  const bind = useDrag(
    ({ down, movement: [mx], direction: [dx], distance, cancel, last }) => {
      // Only handle swipes on mobile when sidebar is open
      if (!isMobile || !sidebarOpen) return

      // If dragging right or distance is too small, cancel
      if (dx > 0 || (Array.isArray(distance) ? distance[0] : distance) < 50) {
        if (last) cancel?.()
        return
      }

      // If swiping left with enough distance, close sidebar
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
    if (sidebarOpen && isMobile && sidebarRef.current) {
      // Focus the first focusable element in sidebar when opened on mobile
      const firstFocusable = sidebarRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement
      if (firstFocusable) {
        firstFocusable.focus()
      }
    }
  }, [sidebarOpen, isMobile])

  // Handle escape key to close sidebar on mobile
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen && isMobile) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [sidebarOpen, isMobile, setSidebarOpen])

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

  return (
    <ErrorBoundary>
      <Head>
        <title>OM Intel Chat</title>
        <meta name="description" content="AI-powered commercial real estate analysis" />
      </Head>

      {/* Responsive Layout Container */}
      <div className={`
        h-screen bg-white dark:bg-gray-900 overflow-hidden overflow-x-hidden flex
        ${isDesktop ? 'transition-all duration-300' : ''}
      `}>
        {/* Sidebar Container */}
        <div className={`
          ${isMobile 
            ? `fixed inset-y-0 left-0 z-50 w-full max-w-sm transform transition-transform duration-300 ease-in-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : isTablet
            ? `relative flex-shrink-0 transform transition-all duration-300 ease-in-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : `relative flex-shrink-0 transition-all duration-300 ease-in-out`
          }
          bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          flex flex-col overflow-hidden
        `}
        style={{
          width: isMobile ? '100%' : sidebarOpen || isDesktop ? `${sidebarWidth}px` : '0px'
        }}
        ref={sidebarRef}
        {...(isMobile ? bind() : {})}
        >
          {/* Sidebar Content */}
          <div className={`
            flex flex-col h-full
            ${sidebarState === 'collapsed' && !isMobile ? 'items-center' : ''}
          `}>
          {/* Sidebar Header - Fixed */}
          <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className={`flex items-center space-x-2 ${sidebarState === 'collapsed' && !isMobile ? 'justify-center' : ''}`}>
                <Building2 className="h-6 w-6 text-blue-600" />
                {(sidebarState !== 'collapsed' || isMobile) && (
                  <span className="font-semibold text-gray-900 dark:text-white">OM Intel Chat</span>
                )}
              </div>
              
              {/* Controls */}
              <div className="flex items-center space-x-1">
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
                
                {/* Mobile close button */}
                {isMobile && (
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
            {sidebarState === 'collapsed' && !isMobile ? (
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
          {sidebarState === 'collapsed' && !isMobile && documents.length > 0 && (
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
          {(sidebarState !== 'collapsed' || isMobile) && (
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
                      <div className="space-y-1" role="list">
                        {/* Compact Document Items */}
                        {documents.slice(0, showAllDocuments ? documents.length : 5).map((doc) => (
                          <div
                            key={doc.id}
                            role="listitem"
                            aria-selected={selectedDocumentId === doc.id}
                            className={`group relative px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-all duration-200 ${
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
                            <div className="flex items-center space-x-2">
                              <FileText className={`h-3.5 w-3.5 flex-shrink-0 ${
                                selectedDocumentId === doc.id ? 'text-blue-600' : 'text-gray-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                  {doc.name}
                                </p>
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                  {getStatusIcon(doc.status)}
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {doc.size}MB
                                  </p>
                                  {selectedDocumentId === doc.id && (
                                    <span className="text-xs text-blue-600 font-medium">Active</span>
                                  )}
                                </div>
                              </div>
                              {/* Quick Actions */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
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
                          <div className="px-2 pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-6 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              onClick={() => setShowAllDocuments(!showAllDocuments)}
                            >
                              {showAllDocuments ? (
                                <>
                                  <ChevronDown className="h-3 w-3 mr-1 rotate-180" />
                                  Show Less
                                </>
                              ) : (
                                <>
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View All ({documents.length})
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <FileText className="h-5 w-5 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          No documents yet
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-6 text-xs text-blue-600"
                          onClick={() => setShowUpload(true)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Upload Document
                        </Button>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          {/* User Profile - Fixed at bottom */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
            {sidebarState === 'collapsed' && !isMobile ? (
              /* Collapsed view */
              <div className="flex flex-col items-center space-y-2">
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
                  className="h-7 w-7 p-0"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              /* Normal/expanded view */
              <div className="flex items-center space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                    {userDisplayData.name.split(' ').map((n: string) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
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
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Mobile Overlay Backdrop */}
        {isMobile && sidebarOpen && (
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

          {/* Chat Area - Proper flex layout with overflow */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Messages - Independent scroll zone */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-8">
                {messages.length === 0 ? (
                  // Welcome State
                  <div className="text-center py-12">
                    <div className="mb-6">
                      <Avatar className="h-16 w-16 mx-auto mb-4">
                        <AvatarFallback className="bg-blue-100 dark:bg-blue-900">
                          <Bot className="h-8 w-8 text-blue-600" />
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <h1 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4">
                      How can I help, {userDisplayData.name.split(' ')[0]}?
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                      I'm OM Intel, your AI assistant for commercial real estate analysis. Upload documents and ask questions about your deals.
                    </p>
                    
                    {/* Suggested prompts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                      <Button 
                        variant="outline" 
                        className="h-auto p-4 text-left justify-start"
                        onClick={() => setMessage("Analyze the key risks in this commercial lease agreement")}
                      >
                        <FileText className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                          <div className="font-medium">Analyze lease agreements</div>
                          <div className="text-sm text-gray-500">Review terms and identify risks</div>
                        </div>
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="h-auto p-4 text-left justify-start"
                        onClick={() => setMessage("What are the current market trends for office properties?")}
                      >
                        <Building2 className="h-5 w-5 mr-3 text-green-600" />
                        <div>
                          <div className="font-medium">Market analysis</div>
                          <div className="text-sm text-gray-500">Get insights on property trends</div>
                        </div>
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="h-auto p-4 text-left justify-start"
                        onClick={() => setMessage("Help me evaluate this investment opportunity")}
                      >
                        <MessageSquare className="h-5 w-5 mr-3 text-purple-600" />
                        <div>
                          <div className="font-medium">Investment evaluation</div>
                          <div className="text-sm text-gray-500">Assess deal potential and returns</div>
                        </div>
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="h-auto p-4 text-left justify-start"
                        onClick={() => setMessage("What due diligence items should I focus on?")}
                      >
                        <Settings className="h-5 w-5 mr-3 text-orange-600" />
                        <div>
                          <div className="font-medium">Due diligence</div>
                          <div className="text-sm text-gray-500">Comprehensive property review</div>
                        </div>
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Chat Messages with new MessageBubble component
                  <div className="space-y-4">
                    {messages.map((msg, index) => (
                      <MessageBubble
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.timestamp}
                        isLoading={msg.role === 'assistant' && index === messages.length - 1 && isLoading}
                        onCopy={() => {
                          // Optional: Add analytics or toast notification
                          console.log('Message copied:', msg.content.slice(0, 50) + '...')
                        }}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="max-w-3xl mx-auto">
                <div className="relative flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute left-3 z-10"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask anything about commercial real estate..."
                    className="pl-12 pr-24 py-3 text-base border-gray-300 dark:border-gray-600 rounded-xl"
                    disabled={isLoading}
                  />
                  
                  <div className="absolute right-3 flex items-center space-x-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setShowUpload(true)}
                      title="Upload document"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm"
                      onClick={handleSendMessage}
                      disabled={!message.trim() || isLoading}
                      className="rounded-lg"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-center mt-2">
                  <Button variant="ghost" size="sm" className="text-xs text-gray-500">
                    <FileText className="h-3 w-3 mr-1" />
                    Tools
                  </Button>
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
                  console.log('Document uploaded:', document)
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
