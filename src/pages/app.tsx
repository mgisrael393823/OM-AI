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
  LogOut,
  Menu,
  X,
  Plus,
  Send,
  FileText,
  Bot,
  User,
  Mic,
  Paperclip,
  Loader2
} from "lucide-react"
import { useChatPersistent } from "@/hooks/useChatPersistent"
import { DocumentUpload } from "@/components/app/DocumentUpload"

export default function AppPage() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [mounted, setMounted] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { 
    messages, 
    chatSessions, 
    currentSessionId,
    isLoading, 
    isLoadingHistory,
    sendMessage, 
    createNewChat,
    loadChatSession,
    deleteChatSession 
  } = useChatPersistent()

  // Check authentication and prevent hydration issues
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          router.push('/auth/login')
          return
        }
        
        setIsAuthenticated(true)
        setMounted(true)
      } catch (error) {
        console.error('Auth check failed:', error)
        router.push('/auth/login')
      }
    }
    
    checkAuth()
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Temporary user data
  const user = {
    name: "User",
    email: "user@example.com",
    plan: 'Starter'
  }

  // Use actual chat sessions from database
  const chatHistory = chatSessions.map(session => session.title || 'Untitled Chat')

  // Show loading until authenticated and mounted
  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  const handleSendMessage = async () => {
    if (message.trim() && !isLoading) {
      const messageToSend = message
      setMessage("")
      await sendMessage(messageToSend)
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

          {/* Chat History */}
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1">
              {isLoadingHistory ? (
                <div className="px-2 py-8 text-center">
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
              ) : (
                <div className="px-2 py-8 text-center">
                  <MessageSquare className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
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
                  {user.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {user.plan}
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
                      How can I help, {user.name.split(' ')[0]}?
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
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}