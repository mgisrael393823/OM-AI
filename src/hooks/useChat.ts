import { useState, useCallback } from "react"

export interface Message {
  role: "user" | "assistant"
  content: string
  id: string
  timestamp: Date
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    let response: Response | undefined
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // SAFETY: Check content-type before attempting to stream
      const contentType = response.headers.get('content-type') || ''
      const isSSE = /(^|\s|;)text\/event-stream/i.test(contentType)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

      if (isSSE && response.body) {
        // SSE STREAMING PATH: Real line buffering and parsing
        reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            let pendingError: string | null = null

            for (const line of lines) {
              if (line.startsWith('event: error')) {
                // Error event - next data line should contain error info
                pendingError = 'error'
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6)
                
                if (data === '[DONE]') {
                  return // Clean exit - stream complete
                }

                if (pendingError === 'error') {
                  // This is error data
                  try {
                    const errorData = JSON.parse(data)
                    throw new Error(errorData.message || 'Stream error occurred')
                  } catch (parseError) {
                    throw new Error('Stream error occurred')
                  }
                }

                try {
                  const parsed = JSON.parse(data)
                  if (parsed.content) {
                    // Single state update per chunk - avoid multiple enqueues
                    setMessages(prev => {
                      const newMessages = [...prev]
                      const lastMessage = newMessages[newMessages.length - 1]
                      if (lastMessage.role === "assistant") {
                        lastMessage.content += parsed.content
                      }
                      return newMessages
                    })
                  }
                } catch (parseError) {
                  // Ignore malformed JSON in data frames - continue processing
                }
              }
            }
          }
        } finally {
          // SAFETY: Guard reader cleanup with existence checks
          if (reader && typeof reader.cancel === 'function') {
            try {
              reader.cancel()
            } catch (e) {
              // Reader cleanup failed, ignore
            }
          }
          if (reader && typeof reader.releaseLock === 'function') {
            try {
              reader.releaseLock()
            } catch (e) {
              // Lock release failed, ignore
            }
          }
        }
      } else {
        // JSON RESPONSE PATH: No reader calls, direct parsing
        try {
          const jsonData = await response.json()
          
          // Handle error responses
          if (jsonData.error) {
            throw new Error(jsonData.message || jsonData.error)
          }

          // Single state update with complete message
          setMessages(prev => {
            const newMessages = [...prev]
            const lastMessage = newMessages[newMessages.length - 1]
            if (lastMessage.role === "assistant") {
              lastMessage.content = jsonData.message || ''
            }
            return newMessages
          })
        } catch (jsonError) {
          throw new Error('Failed to parse server response')
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      
      let errorMessage = "I apologize, but I'm having trouble connecting right now. Please try again."
      
      // Enhanced error handling for different error sources
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (response && !response.ok) {
        try {
          const errorData = await response.json()
          if (errorData.message) {
            errorMessage = errorData.message
          } else if (errorData.code === 'MODEL_UNAVAILABLE') {
            errorMessage = "The requested AI model is not available. Please try again or contact support."
          } else if (errorData.code === 'UPSTREAM_AUTH') {
            errorMessage = "Authentication error with AI service. Please contact support."
          } else if (errorData.code === 'UPSTREAM_ERROR') {
            errorMessage = "AI service is temporarily unavailable. Please try again in a moment."
          }
        } catch (parseError) {
          // Fall back to generic message if JSON parsing fails
          console.warn("Failed to parse server error response:", parseError)
        }
      }

      const errorMessageObj: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: errorMessage,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessageObj])
    } finally {
      // GUARANTEED: Always clear loading state regardless of path or error
      setIsLoading(false)
    }
  }, [messages, isLoading])

  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat
  }
}