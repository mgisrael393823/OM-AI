import React, { useState, useEffect, useRef } from "react"
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
  AlertCircle
} from "lucide-react"
import { useChatPersistent } from "@/hooks/useChatPersistent"
import { DocumentUpload } from "@/components/app/DocumentUpload"
import { useAuth } from "@/contexts/AuthContext"

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [showUpload, setShowUpload] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { 
    messages, 
    chatSessions, 
    currentSessionId,
    isLoading, 
    isLoadingHistory,
    sendMessage, 
    createNewChat,
    loadChatSession
  } = useChatPersistent(selectedDocumentId)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  // Fetch user documents
  const fetchDocuments = async () => {
    if (!user) return
    
    setIsLoadingDocuments(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        console.error('No session token available')
        return
      }

      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
      } else {
        console.error('Failed to fetch documents:', response.statusText)
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  // Load documents when user is authenticated
  useEffect(() => {
    if (user) {
      fetchDocuments()
    }
  }, [user, fetchDocuments])

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

  return (
    <>
      <Head>
        <title>OM Intel Chat</title>
        <meta name="description" content="AI-powered commercial real estate analysis" />
      </Head>

      <div className="flex h-screen bg-white dark:bg-gray-900">
        {/* Sidebar */}
        <div className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          md:translate-x-0 fixed md:relative z-50 w-64 h-full bg-gray-50 dark:bg-gray-800 
          border-r border-gray-200 dark:border-gray-700 transition-transform duration-300
        `}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 className="h-6 w-6 text-blue-600" />
                <span className="font-semibold text-gray-900 dark:text-white">OM Intel Chat</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* New Chat Button */}
          <div className="p-4">
            <Button 
              className="w-full justify-start" 
              variant="outline"
              onClick={handleNewChat}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>

          {/* Chat History & Documents */}
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1">
              {/* Chat Sessions */}
              {isLoadingHistory ? (
                <div className="px-2 py-4 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-600 mb-2" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Loading chats...
                  </p>
                </div>
              ) : chatSessions.length > 0 ? (
                <>
                  <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Chats
                  </div>
                  {chatSessions.map((session) => (
                    <Button
                      key={session.id}
                      variant={currentSessionId === session.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-left h-auto py-2 px-3 text-sm font-normal"
                      onClick={() => loadChatSession(session.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{session.title || 'Untitled Chat'}</span>
                    </Button>
                  ))}
                </>
              ) : null}

              {/* Documents Section */}
              <div className="pt-4">
                <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Documents
                </div>
                {isLoadingDocuments ? (
                  <div className="px-2 py-4 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-600 mb-2" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Loading documents...
                    </p>
                  </div>
                ) : documents.length > 0 ? (
                  <div className="space-y-1">
                    {documents.map((doc) => {
                      const getStatusIcon = (status: Document['status']) => {
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
                      }
                      
                      return (
                        <div
                          key={doc.id}
                          className={`px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors ${
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
                          <div className="flex items-start space-x-2">
                            <FileText className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                              selectedDocumentId === doc.id ? 'text-blue-600' : 'text-gray-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {doc.name}
                              </p>
                              <div className="flex items-center space-x-2 mt-0.5">
                                {getStatusIcon(doc.status)}
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {doc.size}MB
                                </p>
                                {selectedDocumentId === doc.id && (
                                  <span className="text-xs text-blue-600 font-medium">Selected</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-2 py-4 text-center">
                    <FileText className="h-6 w-6 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No documents yet
                    </p>
                  </div>
                )}
              </div>

              {chatSessions.length === 0 && (
                <div className="px-2 py-4 text-center">
                  <MessageSquare className="h-6 w-6 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No chats yet
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
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
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-gray-900 dark:text-white">OM Intel Chat</span>
            <div className="w-8" /> {/* Spacer */}
          </div>

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

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <ScrollArea className="flex-1">
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
                  // Chat Messages
                  <div className="space-y-6">
                    {messages.map((msg, index) => (
                      <div key={msg.id} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'assistant' && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-blue-100 dark:bg-blue-900">
                              <Bot className="h-5 w-5 text-blue-600" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`
                          max-w-2xl p-4 rounded-lg
                          ${msg.role === 'assistant' 
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' 
                            : 'bg-blue-600 text-white'
                          }
                        `}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.role === 'assistant' && index === messages.length - 1 && isLoading && (
                            <div className="flex items-center mt-2">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              <span className="text-sm opacity-70">Thinking...</span>
                            </div>
                          )}
                        </div>
                        {msg.role === 'user' && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-gray-100 dark:bg-gray-700">
                              <User className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </ScrollArea>

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
                }}
                onDocumentListRefresh={fetchDocuments}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}