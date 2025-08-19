import { useState, useCallback, useEffect, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useChatSessions, type ChatSession } from "@/hooks/useChatSessions"
import { isChatModel, isResponsesModel } from "@/lib/services/openai/modelUtils"
import { useTypingIndicator } from "@/hooks/useTypingIndicator"
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

// Generate correlation ID for request tracking
function generateCorrelationId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function useChatPersistent(selectedDocumentId?: string | null) {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Typing indicator with 600ms thinking timeout
  const typingIndicator = useTypingIndicator(600)
  
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
  // docId should be the server-generated documentId from upload (mem-{ULID} format)
  const sendMessage = useCallback(async (content: string, docId?: string | null, contextDocIds?: string[]) => {
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
        // Enable streaming for Responses API
        payload.stream = true
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
      // Validate document ID format - must start with 'mem-' for KV storage
      if (finalDocId) {
        if (finalDocId.startsWith('mem-')) {
          payload.documentId = finalDocId
          payload.metadata = { documentId: finalDocId }
        } else {
          console.warn(`[useChatPersistent] Invalid document ID format: ${finalDocId}. Expected 'mem-*' prefix. Proceeding without document context.`)
          // Don't include invalid document ID in payload
        }
      }
      
      // Include context docIds if provided (for memory-aware retrieval)
      if (contextDocIds && contextDocIds.length > 0) {
        payload.context = { docIds: contextDocIds }
      }
      
      // Add cache busting and correlation ID for streaming
      payload.correlationId = generateCorrelationId()
      
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
          cache: 'no-store', // Bypass service worker caching
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "X-Correlation-ID": cleanPayload.correlationId
          },
          body: JSON.stringify(cleanPayload),
        })
      }

      // Start typing indicator
      typingIndicator.startTyping()
      
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
      
      // Handle 409 (document processing or not found) and 424 (context unavailable)
      if (response.status === 409 || response.status === 424) {
        const errorData = await response.json()
        console.log('⏳ Document context issue:', errorData)
        
        // Handle 424 context unavailable with auto-retry
        if (response.status === 424) {
          const retryDelay = errorData.retryAfterMs || 1500
          
          // Show context loading message
          const contextMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: "PDF context is loading. Retrying...",
            timestamp: new Date()
          }
          setMessages(prev => [...prev, contextMessage])
          
          // Auto-retry after specified delay
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          response = await makeRequest(token)
          
          // Remove context loading message
          setMessages(prev => prev.filter(msg => msg.id !== contextMessage.id))
          
          // If still 424, show final error
          if (response.status === 424) {
            const finalError = await response.json()
            const errorMessage: Message = {
              id: (Date.now() + 3).toString(),
              role: "assistant",
              content: "PDF context is still loading. Please try again in a moment or upload a new document.",
              timestamp: new Date()
            }
            setMessages(prev => [...prev, errorMessage])
            return
          }
        }
        // Handle 409 document processing
        else if (errorData.status === 'processing') {
          // Show indexing message
          const indexingMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: "Document is still being indexed. Retrying...",
            timestamp: new Date()
          }
          setMessages(prev => [...prev, indexingMessage])
          
          // Retry up to 3 times with 500ms delays
          for (let attempt = 1; attempt <= 3; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 500))
            
            response = await makeRequest(token)
            if (response.status !== 409) break
            
            const retryData = await response.json()
            if (retryData.status !== 'processing') break
          }
          
          // Remove indexing message
          setMessages(prev => prev.filter(msg => msg.id !== indexingMessage.id))
          
          // If still 409 after retries, show error
          if (response.status === 409) {
            const finalError = await response.json()
            const errorMessage: Message = {
              id: (Date.now() + 3).toString(),
              role: "assistant",
              content: finalError.status === 'processing' 
                ? "Document is still being processed. Please try again in a moment."
                : "Document context not found. The document may have expired or was not properly uploaded. Try uploading again or chat without documents.",
              timestamp: new Date()
            }
            setMessages(prev => [...prev, errorMessage])
            return
          }
        } else {
          // Document not found or error
          const errorMessage: Message = {
            id: (Date.now() + 3).toString(),
            role: "assistant",
            content: errorData.details || "Document context not available. Try uploading again or chat without documents.",
            timestamp: new Date()
          }
          setMessages(prev => [...prev, errorMessage])
          return
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
      
      // Track streaming state for fallback detection
      let hadText = false
      let hadToolCalls = false
      let fallbackTriggered = false
      let textBytesEmitted = 0

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
        
        // Stop typing indicator for non-streaming responses
        typingIndicator.stopTyping()
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
      
      // Stream started - first token timeout is handled by typing indicator

      const reader = response.body?.getReader()
      if (!reader) {
        typingIndicator.stopTyping()
        throw new Error('Response body is not readable')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      
      // Helper function to handle tool-only response fallback
      const handleToolOnlyFallback = async () => {
        if (fallbackTriggered) return false
        fallbackTriggered = true
        
        debugLog('Tool-only response detected, triggering fallback')
        
        try {
          const fallbackResponse = await fetch(`${window.location.origin}/api/chat/fallback-text`, {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'X-Correlation-ID': cleanPayload.correlationId
            },
            body: JSON.stringify({
              ...cleanPayload,
              stream: false,
              tool_choice: 'none',
              response_format: { type: 'text' }
            })
          })
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json()
            const fallbackText = safelyExtractMessageContent(fallbackData)
            
            if (fallbackText) {
              // Update the last assistant message with fallback text
              setMessages(prev => {
                const newMessages = [...prev]
                const lastIndex = newMessages.length - 1
                if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                  newMessages[lastIndex] = {
                    ...newMessages[lastIndex],
                    content: fallbackText
                  }
                }
                return newMessages
              })
              return true
            }
          }
        } catch (fallbackError) {
          debugLog('Fallback request failed:', fallbackError)
        }
        
        return false
      }
      
      // Dual-mode SSE parsing with event buffering
      const abortController = new AbortController()
      let eventBuffer = ''
      let eventCount = 0
      let streamCompleted = false
      
      // Helper function to append delta to message
      const appendDeltaToMessage = (delta: string) => {
        // Mark first token received for typing indicator
        if (!typingIndicator.hasReceivedFirstToken) {
          typingIndicator.onFirstToken()
        }
        
        // Track bytes emitted for fallback gating
        textBytesEmitted += new TextEncoder().encode(delta).length
        
        setMessages(prev => {
          const newMessages = prev.map((msg, index) => {
            if (index === prev.length - 1 && msg.role === "assistant") {
              return {
                ...msg,
                content: msg.content + delta
              }
            }
            return { ...msg }
          })
          return newMessages
        })
      }
      
      // Helper function to process each SSE event
      const processSSEEvent = async (payload: string, eventNum: number) => {
        try {
          const parsed = JSON.parse(payload)
          
          // Responses API format
          if (parsed.type === 'response.output_text.delta') {
            if (eventNum <= 3 || eventNum % 20 === 0) {
              debugLog(`Event ${eventNum}: type=${parsed.type}`)
            }
            const delta = parsed.delta || parsed.response?.output_text?.delta
            if (delta && delta.trim()) {
              hadText = true
              appendDeltaToMessage(delta)
            }
          }
          // Responses API tool calls
          else if (parsed.type?.startsWith('response.tool_calls.')) {
            if (eventNum <= 3 || eventNum % 20 === 0) {
              debugLog(`Event ${eventNum}: type=${parsed.type}`)
            }
            hadToolCalls = true
          }
          // Responses API completion
          else if (parsed.type === 'response.completed') {
            debugLog(`Event ${eventNum}: response.completed`)
            streamCompleted = true
          }
          // Chat Completions API format
          else if (parsed.object === 'chat.completion.chunk') {
            if (eventNum <= 3 || eventNum % 20 === 0) {
              debugLog(`Event ${eventNum}: object=chat.completion.chunk`)
            }
            const choices = parsed.choices || []
            let chunkContent = ''
            
            for (const choice of choices) {
              if (choice.delta?.content) {
                chunkContent += choice.delta.content
              }
              if (choice.delta?.tool_calls || choice.delta?.function_call) {
                hadToolCalls = true
              }
              if (choice.finish_reason) {
                streamCompleted = true
              }
            }
            
            if (chunkContent) {
              hadText = true
              appendDeltaToMessage(chunkContent)
            }
          }
          // Chat Completions final response
          else if (parsed.object === 'chat.completion' && parsed.choices?.[0]?.finish_reason) {
            debugLog(`Event ${eventNum}: chat.completion (final)`)
            streamCompleted = true
          }
          // Ignore other frame types silently
          
        } catch (parseError) {
          debugLog(`Event ${eventNum}: JSON parse failed`, {
            error: parseError,
            payloadPreview: payload.slice(0, 200)
          })
          // Continue without crashing
        }
      }
      
      try {
        while (true && !streamCompleted) {
          const { done, value } = await reader.read()
          if (done) break

          eventBuffer += decoder.decode(value, { stream: true })
          
          if (isSSE) {
            // Split into complete events on blank lines
            const eventParts = eventBuffer.split(/\n\n/)
            eventBuffer = eventParts.pop() || '' // Keep incomplete event
            
            for (const eventData of eventParts) {
              if (!eventData.trim()) continue
              
              // Extract data: lines only, ignore control lines
              const lines = eventData.split(/\n/)
              const dataLines = lines
                .filter(line => line.startsWith('data:') && !line.startsWith(':'))
                .map(line => line.slice(5).trim())
              
              if (dataLines.length === 0) continue
              
              // Join multi-line data: content for single event
              const eventPayload = dataLines.join('\n').replace(/^\uFEFF/, '')
              if (!eventPayload || eventPayload === '[DONE]') {
                // Handle [DONE] for Chat Completions
                streamCompleted = true
                break
              }
              
              eventCount++
              await processSSEEvent(eventPayload, eventCount)
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
                hadText = true
                // Track bytes emitted for fallback gating
                textBytesEmitted += new TextEncoder().encode(textContent).length
                
                if (!typingIndicator.hasReceivedFirstToken) {
                  typingIndicator.onFirstToken()
                }
                
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
        
        // Stream completed - stop typing indicator
        typingIndicator.stopTyping()
        
        // CRITICAL: Hard-gate fallback - only trigger if absolutely zero text was emitted
        const finalMessageContent = messages[messages.length - 1]?.content || ''
        const actualContentLength = finalMessageContent.length
        
        debugLog('Final fallback gating check:', {
          hadText,
          textBytesEmitted,
          actualContentLength,
          fallbackTriggered,
          streamCompleted
        })
        
        // Triple-check: hadText false AND zero bytes emitted AND zero actual content
        if (!hadText && textBytesEmitted === 0 && actualContentLength === 0 && !fallbackTriggered) {
          // Server verification as final gate
          const serverBytes = parseInt(response.headers.get('X-Text-Bytes') || '0')
          
          debugLog('Evaluating STRICT fallback conditions:', {
            hadText,
            textBytesEmitted,
            actualContentLength,
            serverBytes,
            fallbackTriggered,
            decision: serverBytes === 0 ? 'TRIGGER_FALLBACK' : 'SKIP_FALLBACK'
          })
          
          if (serverBytes === 0) {
            debugLog('TRIGGERING FALLBACK: All conditions met - absolutely no text received')
            await handleToolOnlyFallback()
          } else {
            debugLog('SKIPPING FALLBACK: Server reports text bytes', { serverBytes })
          }
        } else {
          debugLog('SKIPPING FALLBACK: Text was received', {
            hadText,
            textBytesEmitted,
            actualContentLength,
            reason: hadText ? 'hadText=true' : textBytesEmitted > 0 ? 'textBytesEmitted>0' : actualContentLength > 0 ? 'actualContent>0' : 'fallbackTriggered=true'
          })
        }
        
        debugLog('Final stream status:', { 
          hadText, 
          hadToolCalls, 
          eventCount, 
          streamCompleted,
          textBytesEmitted,
          finalMessageLength: messages[messages.length - 1]?.content?.length || 0
        })
        
      } catch (streamError) {
        debugLog('Stream reading error:', streamError)
        typingIndicator.stopTyping()
        
        // Abort request and surface user-visible error
        try {
          abortController.abort()
        } catch (e) {
          // AbortController already aborted
        }
        
        // Update assistant message with error message
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
      } finally {
        // Ensure reader lock is released
        try {
          reader.releaseLock()
        } catch (e) {
          // Reader already released
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
      typingIndicator.stopTyping()
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
    renameChatSession,
    // Typing indicator state
    isTyping: typingIndicator.isTyping,
    isThinking: typingIndicator.isThinking
  }
}