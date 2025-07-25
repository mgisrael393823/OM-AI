import { useState, useCallback, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"

export interface Message {
  role: "user" | "assistant"
  content: string
  id: string
  timestamp: Date
}

export interface ChatSession {
  id: string
  title: string | null
  document_id: string | null
  created_at: string
  updated_at: string
  messages?: Message[]
}

export function useChatPersistent(selectedDocumentId?: string | null) {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Get auth token for API calls
  const getAuthToken = useCallback(() => {
    return session?.access_token
  }, [session])

  // Load chat sessions
  const loadChatSessions = useCallback(async () => {
    if (!user || !session) return

    setIsLoadingHistory(true)
    try {
      const response = await fetch(`${window.location.origin}/api/chat-sessions`, {
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${getAuthToken()}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setChatSessions(data.sessions || [])
      }
    } catch (error) {
      console.error("Error loading chat sessions:", error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [user, session, getAuthToken])

  // Load specific chat session
  const loadChatSession = useCallback(async (sessionId: string) => {
    if (!user || !session) return

    try {
      const response = await fetch(`${window.location.origin}/api/chat-sessions/${sessionId}`, {
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${getAuthToken()}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const sessionMessages = data.session.messages || []
        
        setMessages(sessionMessages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at)
        })))
        
        setCurrentSessionId(sessionId)
      }
    } catch (error) {
      console.error("Error loading chat session:", error)
    }
  }, [user, session, getAuthToken])

  // Send message with persistence
  const sendMessage = useCallback(async (content: string, documentId?: string | null) => {
    if (!content.trim() || isLoading || !user || !session) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const payload = {
        message: content.trim(),
        sessionId: currentSessionId,
        documentId: documentId || selectedDocumentId,
        options: {
          stream: true
        }
      }
      
      console.log('📤 CLIENT PAYLOAD:', payload)
      
      const response = await fetch(`${window.location.origin}/api/chat`, {
        method: "POST",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Get session ID from response headers
      const newSessionId = response.headers.get('X-Chat-Session-Id')
      if (newSessionId && !currentSessionId) {
        setCurrentSessionId(newSessionId)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let buffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          
          // Process SSE lines
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6) // Remove 'data: ' prefix
              
              try {
                const parsed = JSON.parse(data)
                
                if (parsed.content) {
                  setMessages(prev => {
                    const newMessages = [...prev]
                    const lastMessage = newMessages[newMessages.length - 1]
                    if (lastMessage.role === "assistant") {
                      lastMessage.content += parsed.content
                    }
                    return newMessages
                  })
                } else if (parsed.function_call) {
                  // Handle function calls if needed
                  console.log('Function call:', parsed.function_call)
                } else if (parsed.done) {
                  // Stream completed
                  break
                } else if (parsed.error) {
                  console.error('Stream error:', parsed.error)
                  throw new Error(parsed.error)
                }
              } catch (e) {
                // Skip invalid JSON
                console.warn('Invalid SSE data:', data)
              }
            }
          }
        }
      }

      // Reload chat sessions to update the list
      await loadChatSessions()
    } catch (error) {
      console.error("Error sending message:", error)
      
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "I apologize, but I'm having trouble connecting right now. Please try again.",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [currentSessionId, isLoading, user, session, getAuthToken, loadChatSessions, selectedDocumentId])

  // Create new chat session
  const createNewChat = useCallback(async () => {
    setMessages([])
    setCurrentSessionId(null)
  }, [])

  // Delete chat session
  const deleteChatSession = useCallback(async (sessionId: string) => {
    if (!user || !session) return

    try {
      const response = await fetch(`${window.location.origin}/api/chat-sessions/${sessionId}`, {
        method: "DELETE",
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${getAuthToken()}`
        }
      })

      if (response.ok) {
        // Remove from local state
        setChatSessions(prev => prev.filter(s => s.id !== sessionId))
        
        // If this was the current session, clear it
        if (currentSessionId === sessionId) {
          setMessages([])
          setCurrentSessionId(null)
        }
      }
    } catch (error) {
      console.error("Error deleting chat session:", error)
    }
  }, [user, session, currentSessionId, getAuthToken])

  // Load chat sessions on mount
  useEffect(() => {
    if (user && session) {
      loadChatSessions()
    }
  }, [user, session, loadChatSessions])

  // This effect was for loading initial sessions, but we removed that functionality
  // since we're now using selectedDocumentId for document context instead

  return {
    messages,
    chatSessions,
    currentSessionId,
    isLoading,
    isLoadingHistory,
    sendMessage,
    createNewChat,
    loadChatSession,
    deleteChatSession,
    loadChatSessions
  }
}