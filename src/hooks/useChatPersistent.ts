import { useState, useCallback, useEffect, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useChatSessions, type ChatSession } from "@/hooks/useChatSessions"

export interface Message {
  role: "user" | "assistant"
  content: string
  id: string
  timestamp: Date
}

export function useChatPersistent(selectedDocumentId?: string | null) {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Use centralized sessions hook
  const { sessions: chatSessions, isLoading: isLoadingHistory, refresh: refreshSessions } = useChatSessions()
  
  // Store the selectedDocumentId in a ref to use in callbacks
  const selectedDocumentIdRef = useRef(selectedDocumentId)
  useEffect(() => {
    selectedDocumentIdRef.current = selectedDocumentId
  }, [selectedDocumentId])

  // Get auth token for API calls
  const getAuthToken = useCallback(() => {
    return session?.access_token
  }, [session])


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
        documentId: documentId || selectedDocumentIdRef.current,
        options: {
          stream: true
        }
      }
      
      // Log payload for debugging if needed
      if (process.env.NODE_ENV === 'development') {
        console.log('📤 Sending message:', {
          hasDocumentId: !!(documentId || selectedDocumentIdRef.current),
          sessionId: currentSessionId
        })
      }
      
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
        const errorText = await response.text()
        console.error('❌ API ERROR:', errorText)
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
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
      const contentType = response.headers.get('content-type') || ''
      const isSSEFormat = contentType.includes('text/event-stream')

      if (reader) {
        let buffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          
          if (isSSEFormat) {
            // Process SSE format: data: {"content": "text"}\n\n
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6) // Remove 'data: ' prefix
                
                try {
                  const parsed = JSON.parse(data)
                  
                  if (parsed.content) {
                    setMessages(prev => {
                      // Create new array and deep clone all messages
                      const newMessages = prev.map((msg, index) => {
                        if (index === prev.length - 1 && msg.role === "assistant") {
                          // For the last assistant message, append the content
                          return {
                            ...msg,
                            content: msg.content + parsed.content,
                            // Force new object reference with timestamp
                            __lastUpdate: Date.now()
                          }
                        }
                        return { ...msg }
                      })
                      return newMessages
                    })
                  } else if (parsed.done) {
                    // Stream completed
                    break
                  } else if (parsed.error) {
                    console.error('Stream error:', parsed.error)
                    throw new Error(parsed.error)
                  }
                } catch (e) {
                  console.warn('Invalid SSE data:', data)
                }
              }
            }
          } else {
            // Process plain text format: direct text chunks
            if (buffer) {
              const currentBuffer = buffer  // Capture buffer before clearing
              buffer = '' // Clear buffer BEFORE processing to avoid closure issues
              
              // Update immediately with each chunk
              setMessages(prev => {
                // Force completely new array and objects to ensure React re-renders
                const result = prev.map((msg, index) => {
                  if (index === prev.length - 1 && msg.role === "assistant") {
                    return {
                      id: msg.id,
                      role: msg.role,
                      content: (msg.content || '') + currentBuffer,
                      timestamp: msg.timestamp
                    }
                  }
                  return {
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp
                  }
                })
                return result
              })
            }
          }
        }
      }
      

      // Refresh sessions if a new session was created
      if (newSessionId && !currentSessionId) {
        await refreshSessions()
      }
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
  }, [currentSessionId, isLoading, user, session, getAuthToken, refreshSessions])

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
        // Refresh sessions through centralized hook
        await refreshSessions()
        
        // If this was the current session, clear it
        if (currentSessionId === sessionId) {
          setMessages([])
          setCurrentSessionId(null)
        }
      }
    } catch (error) {
      console.error("Error deleting chat session:", error)
    }
  }, [user, session, currentSessionId, getAuthToken, refreshSessions])

  // Rename chat session
  const renameChatSession = useCallback(async (sessionId: string, newTitle: string) => {
    if (!user || !session) return

    try {
      const response = await fetch(`${window.location.origin}/api/chat-sessions/${sessionId}`, {
        method: "PATCH",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ title: newTitle })
      })

      if (response.ok) {
        // Refresh sessions through centralized hook
        await refreshSessions()
      }
    } catch (error) {
      console.error("Error renaming chat session:", error)
    }
  }, [user, session, getAuthToken, refreshSessions])


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
    renameChatSession
  }
}