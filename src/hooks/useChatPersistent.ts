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

export function useChatPersistent(initialSessionId?: string) {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId || null)
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
      const response = await fetch("/api/chat-sessions", {
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
      const response = await fetch(`/api/chat-sessions/${sessionId}`, {
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
  const sendMessage = useCallback(async (content: string) => {
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
      const response = await fetch("/api/chat-enhanced", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          message: content.trim(),
          chat_session_id: currentSessionId
        }),
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
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          
          setMessages(prev => {
            const newMessages = [...prev]
            const lastMessage = newMessages[newMessages.length - 1]
            if (lastMessage.role === "assistant") {
              lastMessage.content += chunk
            }
            return newMessages
          })
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
  }, [currentSessionId, isLoading, user, session, getAuthToken, loadChatSessions])

  // Create new chat session
  const createNewChat = useCallback(async () => {
    setMessages([])
    setCurrentSessionId(null)
  }, [])

  // Delete chat session
  const deleteChatSession = useCallback(async (sessionId: string) => {
    if (!user || !session) return

    try {
      const response = await fetch(`/api/chat-sessions/${sessionId}`, {
        method: "DELETE",
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

  // Load specific session if provided
  useEffect(() => {
    if (initialSessionId && user && session) {
      loadChatSession(initialSessionId)
    }
  }, [initialSessionId, user, session, loadChatSession])

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