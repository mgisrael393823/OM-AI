import { useState, useCallback, useRef, useEffect } from 'react'

export interface TypingIndicatorState {
  isTyping: boolean
  isThinking: boolean
  hasReceivedFirstToken: boolean
}

export interface TypingIndicatorControls {
  startTyping: () => void
  stopTyping: () => void
  onFirstToken: () => void
  reset: () => void
}

/**
 * Centralized typing indicator hook that manages stream lifecycle states
 * Handles "thinking" timeout if no tokens arrive within 500-700ms
 */
export function useTypingIndicator(thinkingTimeoutMs: number = 600): TypingIndicatorState & TypingIndicatorControls {
  const [isTyping, setIsTyping] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [hasReceivedFirstToken, setHasReceivedFirstToken] = useState(false)
  
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isActiveRef = useRef(false)

  // Start typing - triggers thinking timeout
  const startTyping = useCallback(() => {
    setIsTyping(true)
    setIsThinking(false)
    setHasReceivedFirstToken(false)
    isActiveRef.current = true
    
    // Clear any existing timeout
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current)
    }
    
    // Set thinking timeout if no tokens arrive
    thinkingTimeoutRef.current = setTimeout(() => {
      if (isActiveRef.current && !hasReceivedFirstToken) {
        setIsThinking(true)
      }
    }, thinkingTimeoutMs)
  }, [thinkingTimeoutMs, hasReceivedFirstToken])

  // Stop typing - clears all states and timeouts
  const stopTyping = useCallback(() => {
    setIsTyping(false)
    setIsThinking(false)
    isActiveRef.current = false
    
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current)
      thinkingTimeoutRef.current = null
    }
  }, [])

  // Called when first token is received
  const onFirstToken = useCallback(() => {
    setHasReceivedFirstToken(true)
    setIsThinking(false)
    
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current)
      thinkingTimeoutRef.current = null
    }
  }, [])

  // Reset all states
  const reset = useCallback(() => {
    setIsTyping(false)
    setIsThinking(false)
    setHasReceivedFirstToken(false)
    isActiveRef.current = false
    
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current)
      thinkingTimeoutRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current)
      }
    }
  }, [])

  return {
    isTyping,
    isThinking,
    hasReceivedFirstToken,
    startTyping,
    stopTyping,
    onFirstToken,
    reset
  }
}