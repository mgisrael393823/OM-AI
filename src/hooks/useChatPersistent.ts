import { useState, useCallback, useEffect, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useChatSessions, type ChatSession } from "@/hooks/useChatSessions"
import { isChatModel, isResponsesModel } from "@/lib/services/openai/modelUtils"
import { supabase } from "@/lib/supabase"

export interface Message {
  role: "user" | "assistant"
  content: string
  id: string
  timestamp: Date
}

// Debug flag for comprehensive chat logging (development only)
const CHAT_DEBUG = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_CHAT_DEBUG !== 'false'

// Debug logging helper
function debugLog(message: string, data?: any) {
  if (CHAT_DEBUG) {
    if (data !== undefined) {
      console.log(`🐛 [Chat Debug] ${message}`, data)
    } else {
      console.log(`🐛 [Chat Debug] ${message}`)
    }
  }
}

// Helper to safely stringify data for logging (truncate large objects)
function safeLogData(data: any, maxLength = 500): any {
  if (typeof data === 'string' && data.length > maxLength) {
    return data.substring(0, maxLength) + '... (truncated)'
  }
  if (typeof data === 'object' && data !== null) {
    try {
      const stringified = JSON.stringify(data, null, 2)
      if (stringified.length > maxLength) {
        return JSON.stringify(data) // Compact version if too long
      }
      return data
    } catch (e) {
      return '[Object - could not stringify]'
    }
  }
  return data
}

// Helper function to safely extract message content from various response formats
function safelyExtractMessageContent(input: any): string {
  // If already a string, return it
  if (typeof input === 'string') {
    return input
  }
  
  // If null or undefined, return empty string
  if (input == null) {
    return ""
  }
  
  // If it's an object, try to extract known content fields
  if (typeof input === 'object') {
    // Prefer 'message' field (our API response format)
    if (typeof input.message === 'string') {
      return input.message
    }

    // Fallback to 'content' field
    if (typeof input.content === 'string') {
      return input.content
    }

    // Fallback to 'text' field
    if (typeof input.text === 'string') {
      return input.text
    }

    // If object has error field, return error message
    if (typeof input.error === 'string') {
      return `Error: ${input.error}`
    }
  }
  
  // Log unexpected format in development
  debugLog('Unexpected response format in safelyExtractMessageContent:', {
    inputType: typeof input,
    inputValue: safeLogData(input, 200)
  })
  
  // Return fallback message
  return "I apologize, but I received an unexpected response format. Please try again."
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

  // Get auth token for API calls with validation and refresh
  const getAuthToken = useCallback(async () => {
    if (!session?.access_token) {
      return null
    }

    // Check if token is expired or close to expiring (5 minute buffer)
    if (session.expires_at) {
      const expirationTime = session.expires_at * 1000 // Convert to milliseconds
      const now = Date.now()
      const fiveMinutesInMs = 5 * 60 * 1000
      
      // If token expires within 5 minutes, refresh it
      if (expirationTime - now < fiveMinutesInMs) {
        console.log('🔄 Token expiring soon, refreshing session...')
        try {
          const { data, error } = await supabase.auth.refreshSession()
          if (error) {
            console.error('❌ Failed to refresh session:', error)
            return session.access_token // Return current token as fallback
          }
          
          if (data?.session?.access_token) {
            console.log('✅ Session refreshed successfully')
            return data.session.access_token
          }
        } catch (error) {
          console.error('❌ Error refreshing session:', error)
        }
      }
    }

    return session.access_token
  }, [session])


  // Load specific chat session with token refresh and retry
  const loadChatSession = useCallback(async (sessionId: string) => {
    if (!user || !session) return

    const makeRequest = async (token: string | null) => {
      if (!token) throw new Error('No auth token available')
      
      return fetch(`${window.location.origin}/api/chat-sessions/${sessionId}`, {
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      })
    }

    try {
      const token = await getAuthToken()
      let response = await makeRequest(token)

      // If we get 401, try refreshing token and retry once
      if (response.status === 401) {
        console.log('🔄 Got 401, refreshing token and retrying...')
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.access_token) {
          response = await makeRequest(data.session.access_token)
        }
      }

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
  const sendMessage = useCallback(async (content: string, docId?: string | null) => {
    // In-flight guard - prevent double submissions
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
      const finalDocId = docId || selectedDocumentIdRef.current
      const model = process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o'
      
      // Build clean payload based on model family
      let payload: Record<string, any> = {
        model
      }
      
      if (isResponsesModel(model)) {
        // Responses API format: {model, input|messages, max_output_tokens?, stream?}
        payload.input = content.trim()
        const maxTokens = process.env.NEXT_PUBLIC_MAX_TOKENS_RESPONSES
        if (maxTokens) payload.max_output_tokens = Number(maxTokens)
        // Only add stream for Responses API if supported
        payload.stream = false // Disable streaming for Responses API for now
      } else {
        // Chat Completions API format: {model, messages, max_tokens?, stream?}
        const chatHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
        payload.messages = [...chatHistory, {role: 'user', content: content.trim()}]
        const maxTokens = process.env.NEXT_PUBLIC_MAX_TOKENS_CHAT
        if (maxTokens) payload.max_tokens = Number(maxTokens)
        // Add stream for Chat Completions API
        payload.stream = true
      }
      
      // Include sessionId only if it has a valid value (not null/undefined)
      if (currentSessionId) {
        payload.sessionId = currentSessionId
      }
      
      // Include document ID in payload and metadata if provided
      if (finalDocId) {
        payload.documentId = finalDocId
        payload.metadata = { documentId: finalDocId }
      }
      
      // Remove any null or undefined fields from payload
      const cleanPayload = Object.fromEntries(
        Object.entries(payload).filter(([_, value]) => value !== null && value !== undefined)
      )
      
      // Log payload for debugging if needed
      if (process.env.NODE_ENV === 'development') {
        console.log('📤 Sending message:', {
          apiFamily: isResponsesModel(model) ? 'responses' : 'chat',
          model,
          hasDocumentId: !!finalDocId,
          sessionId: currentSessionId || 'none',
          messageCount: cleanPayload.messages?.length || 0,
          payloadKeys: Object.keys(cleanPayload)
        })
      }
      
      const makeRequest = async (token: string | null) => {
        if (!token) throw new Error('No auth token available')
        
        return fetch(`${window.location.origin}/api/chat`, {
          method: "POST",
          credentials: 'include',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(cleanPayload),
        })
      }

      const token = await getAuthToken()
      let response = await makeRequest(token)

      // If we get 401, try refreshing token and retry once
      if (response.status === 401) {
        console.log('🔄 Got 401 on chat request, refreshing token and retrying...')
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.access_token) {
          response = await makeRequest(data.session.access_token)
        }
      }


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

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')
      const isSSE = contentType.includes('text/event-stream')
      const isPlainText = contentType.includes('text/plain')

      // Debug: Log response details
      debugLog('Response received:', {
        status: response.status,
        statusText: response.statusText,
        contentType: contentType,
        sessionId: newSessionId || 'none',
        hasBody: !!response.body
      })
      
      debugLog('Format detection:', {
        isJson,
        isSSE,
        isPlainText,
        rawContentType: contentType
      })

      // Handle non-streaming JSON responses with fallbacks
      if (isJson) {
        let messageContent = ""
        
        try {
          // Primary: Try JSON parsing
          const jsonResponse = await response.json()
          debugLog('Raw JSON response structure:', safeLogData(jsonResponse))
          
          messageContent = safelyExtractMessageContent(jsonResponse)
          debugLog('Extracted message content:', {
            originalStructure: {
              hasMessage: !!jsonResponse.message,
              hasContent: !!jsonResponse.content,
              hasText: !!jsonResponse.text,
              hasError: !!jsonResponse.error
            },
            extractedLength: messageContent.length,
            extractedPreview: safeLogData(messageContent, 200)
          })
          
        } catch (jsonError) {
          debugLog('JSON parsing failed, trying text fallback:', jsonError)
          
          try {
            // Fallback 1: Try reading as text
            const textResponse = await response.text()
            debugLog('Raw text response:', safeLogData(textResponse, 300))
            
            messageContent = safelyExtractMessageContent(textResponse)
            debugLog('Text fallback successful:', {
              originalLength: textResponse.length,
              extractedLength: messageContent.length,
              extractedPreview: safeLogData(messageContent, 200)
            })
            
          } catch (textError) {
            debugLog('Both JSON and text parsing failed:', textError)
            
            // Fallback 2: Use safe fallback message
            messageContent = "I apologize, but I'm having trouble processing the response. Please try again."
          }
        }
        
        // Ensure we always have a string
        if (!messageContent) {
          messageContent = "I received an empty response. Please try again."
          debugLog('Empty message content detected, using fallback')
        }
        
        debugLog('Final JSON message ready:', {
          contentLength: messageContent.length,
          contentPreview: safeLogData(messageContent, 200)
        })
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: messageContent,
          timestamp: new Date()
        }

        setMessages(prev => [...prev, assistantMessage])
        return
      }

      // Handle streaming responses (SSE or plain text) with fallbacks
      if (!isSSE && !isPlainText && !contentType.includes('text/')) {
        debugLog(`Unsupported content type, attempting text fallback: ${contentType}`)
        // Don't throw error, try to handle as text anyway
      }
      
      debugLog('Starting streaming response processing:', {
        isSSE,
        isPlainText,
        contentType
      })

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          
          if (isSSE) {
            // Process SSE format: data: {"content": "text"}\n\n
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6) // Remove 'data: ' prefix
                
                try {
                  const parsed = JSON.parse(data)
                  debugLog('SSE chunk parsed:', safeLogData(parsed, 200))
                  
                  // Use helper function to safely extract content
                  const contentChunk = safelyExtractMessageContent(parsed)
                  
                  if (contentChunk) {
                    debugLog('SSE content chunk extracted:', {
                      chunkLength: contentChunk.length,
                      chunkPreview: safeLogData(contentChunk, 100)
                    })
                    
                    setMessages(prev => {
                      // Create new array and clone all messages
                      const newMessages = prev.map((msg, index) => {
                        if (index === prev.length - 1 && msg.role === "assistant") {
                          // For the last assistant message, append the content as plain text
                          return {
                            ...msg,
                            content: msg.content + contentChunk
                          }
                        }
                        return { ...msg }
                      })
                      return newMessages
                    })
                  } else if (parsed.done) {
                    debugLog('SSE stream completed')
                    break
                  } else if (parsed.error) {
                    debugLog('SSE stream error, continuing:', parsed.error)
                    // Don't throw error, just log it and continue
                  }
                } catch (parseError) {
                  debugLog('Invalid SSE JSON, trying as plain text:', {
                    originalData: safeLogData(data, 100),
                    error: parseError
                  })
                  
                  // Fallback: treat the data as plain text content
                  if (data && data.trim()) {
                    const textContent = safelyExtractMessageContent(data)
                    if (textContent) {
                      debugLog('SSE fallback text content extracted:', {
                        textLength: textContent.length,
                        textPreview: safeLogData(textContent, 100)
                      })
                      
                      setMessages(prev => {
                        const newMessages = prev.map((msg, index) => {
                          if (index === prev.length - 1 && msg.role === "assistant") {
                            return {
                              ...msg,
                              content: msg.content + textContent
                            }
                          }
                          return { ...msg }
                        })
                        return newMessages
                      })
                    }
                  }
                }
              }
            }
          } else if (isPlainText || contentType.includes('text/')) {
            // Process plain text format: direct text chunks
            if (buffer) {
              const currentBuffer = buffer  // Capture buffer before clearing
              buffer = '' // Clear buffer BEFORE processing to avoid closure issues
              
              debugLog('Plain text chunk received:', {
                bufferLength: currentBuffer.length,
                bufferPreview: safeLogData(currentBuffer, 100)
              })
              
              // Use helper function to safely process text content
              const textContent = safelyExtractMessageContent(currentBuffer)
              
              if (textContent) {
                debugLog('Plain text content extracted:', {
                  textLength: textContent.length,
                  textPreview: safeLogData(textContent, 100)
                })
                
                // Update immediately with each chunk
                setMessages(prev => {
                  // Force completely new array and objects to ensure React re-renders
                  const result = prev.map((msg, index) => {
                    if (index === prev.length - 1 && msg.role === "assistant") {
                      return {
                        id: msg.id,
                        role: msg.role,
                        content: (msg.content || '') + textContent,
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
          } else {
            // Fallback for completely unknown formats
            debugLog(`Unknown streaming format, treating as text: ${contentType}`)
            
            if (buffer) {
              const currentBuffer = buffer
              buffer = ''
              
              debugLog('Unknown format fallback:', {
                bufferLength: currentBuffer.length,
                bufferPreview: safeLogData(currentBuffer, 100)
              })
              
              const fallbackContent = safelyExtractMessageContent(currentBuffer)
              
              if (fallbackContent) {
                setMessages(prev => {
                  const result = prev.map((msg, index) => {
                    if (index === prev.length - 1 && msg.role === "assistant") {
                      return {
                        ...msg,
                        content: (msg.content || '') + fallbackContent
                      }
                    }
                    return { ...msg }
                  })
                  return result
                })
              }
            }
          }
        }
      } catch (streamError) {
        debugLog('Stream reading error:', streamError)
        
        // Instead of throwing, update the assistant message with an error message
        setMessages(prev => {
          const result = prev.map((msg, index) => {
            if (index === prev.length - 1 && msg.role === "assistant" && !msg.content) {
              return {
                ...msg,
                content: "I apologize, but there was an error processing the streaming response. Please try again."
              }
            }
            return { ...msg }
          })
          return result
        })
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

    const makeRequest = async (token: string | null) => {
      if (!token) throw new Error('No auth token available')
      
      return fetch(`${window.location.origin}/api/chat-sessions/${sessionId}`, {
        method: "DELETE",
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      })
    }

    try {
      const token = await getAuthToken()
      let response = await makeRequest(token)

      // If we get 401, try refreshing token and retry once
      if (response.status === 401) {
        console.log('🔄 Got 401 on delete, refreshing token and retrying...')
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.access_token) {
          response = await makeRequest(data.session.access_token)
        }
      }

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

    const makeRequest = async (token: string | null) => {
      if (!token) throw new Error('No auth token available')
      
      return fetch(`${window.location.origin}/api/chat-sessions/${sessionId}`, {
        method: "PATCH",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle })
      })
    }

    try {
      const token = await getAuthToken()
      let response = await makeRequest(token)

      // If we get 401, try refreshing token and retry once
      if (response.status === 401) {
        console.log('🔄 Got 401 on rename, refreshing token and retrying...')
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.access_token) {
          response = await makeRequest(data.session.access_token)
        }
      }

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