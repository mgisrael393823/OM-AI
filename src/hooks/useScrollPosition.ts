import { useCallback, useEffect, useRef, useState } from 'react'

export interface ScrollPosition {
  x: number
  y: number
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
}

export interface ScrollDirections {
  isScrollingUp: boolean
  isScrollingDown: boolean
  isScrollingLeft: boolean
  isScrollingRight: boolean
}

export interface UseScrollPositionOptions {
  debounceMs?: number
  throttleMs?: number
  element?: HTMLElement | React.RefObject<HTMLElement> | null
  disabled?: boolean
  onScroll?: (position: ScrollPosition, directions: ScrollDirections) => void
}

export interface UseScrollPositionReturn {
  scrollPosition: ScrollPosition
  directions: ScrollDirections
  isAtTop: boolean
  isAtBottom: boolean
  isAtLeft: boolean
  isAtRight: boolean
  isNearBottom: boolean
  isNearTop: boolean
  scrollTo: (options: { x?: number; y?: number; behavior?: 'auto' | 'smooth' }) => void
  scrollToTop: (behavior?: 'auto' | 'smooth') => void
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void
  scrollToLeft: (behavior?: 'auto' | 'smooth') => void
  scrollToRight: (behavior?: 'auto' | 'smooth') => void
}

const NEAR_THRESHOLD = 100 // pixels from edge to consider "near"

export function useScrollPosition(options: UseScrollPositionOptions = {}): UseScrollPositionReturn {
  const {
    debounceMs = 10,
    throttleMs = 16, // ~60fps
    element,
    disabled = false,
    onScroll
  } = options

  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    x: 0,
    y: 0,
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0
  })

  const [directions, setDirections] = useState<ScrollDirections>({
    isScrollingUp: false,
    isScrollingDown: false,
    isScrollingLeft: false,
    isScrollingRight: false
  })

  const previousPosition = useRef({ x: 0, y: 0 })
  const rafId = useRef<number>()
  const timeoutId = useRef<number>()
  const lastThrottleTime = useRef(0)

  const updateScrollPosition = useCallback((targetElement: HTMLElement | Window) => {
    const isWindow = targetElement === window
    const scrollElement = isWindow ? document.documentElement : targetElement as HTMLElement

    const newPosition: ScrollPosition = {
      x: isWindow ? window.scrollX : scrollElement.scrollLeft,
      y: isWindow ? window.scrollY : scrollElement.scrollTop,
      scrollTop: isWindow ? window.scrollY : scrollElement.scrollTop,
      scrollLeft: isWindow ? window.scrollX : scrollElement.scrollLeft,
      scrollHeight: scrollElement.scrollHeight,
      scrollWidth: scrollElement.scrollWidth,
      clientHeight: isWindow ? window.innerHeight : scrollElement.clientHeight,
      clientWidth: isWindow ? window.innerWidth : scrollElement.clientWidth
    }

    const newDirections: ScrollDirections = {
      isScrollingUp: newPosition.y < previousPosition.current.y,
      isScrollingDown: newPosition.y > previousPosition.current.y,
      isScrollingLeft: newPosition.x < previousPosition.current.x,
      isScrollingRight: newPosition.x > previousPosition.current.x
    }

    previousPosition.current = { x: newPosition.x, y: newPosition.y }

    setScrollPosition(newPosition)
    setDirections(newDirections)

    onScroll?.(newPosition, newDirections)
  }, [onScroll])

  const throttledUpdate = useCallback((targetElement: HTMLElement | Window) => {
    const now = Date.now()
    if (now - lastThrottleTime.current >= throttleMs) {
      lastThrottleTime.current = now
      updateScrollPosition(targetElement)
    }
  }, [updateScrollPosition, throttleMs])

  const debouncedUpdate = useCallback((targetElement: HTMLElement | Window) => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current)
    }
    timeoutId.current = window.setTimeout(() => {
      updateScrollPosition(targetElement)
    }, debounceMs)
  }, [updateScrollPosition, debounceMs])

  const handleScroll = useCallback((event: Event) => {
    if (disabled) return

    // Handle both HTMLElement and RefObject<HTMLElement>
    const targetElement = element && 'current' in element ? element.current : element
    const scrollTarget = targetElement || window
    if (event.target !== scrollTarget && !element) return

    // Cancel any pending RAF
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
    }

    // Use RAF for smooth updates
    rafId.current = requestAnimationFrame(() => {
      throttledUpdate(scrollTarget)
    })

    // Also debounce for final accurate position
    debouncedUpdate(scrollTarget)
  }, [disabled, element, throttledUpdate, debouncedUpdate])

  useEffect(() => {
    if (disabled) return

    // Handle both HTMLElement and RefObject<HTMLElement>
    const targetElement = element && 'current' in element ? element.current : element
    const scrollTarget = targetElement || window
    
    // Initial position
    updateScrollPosition(scrollTarget)

    // Add scroll listener
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll)
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
      }
      if (timeoutId.current) {
        clearTimeout(timeoutId.current)
      }
    }
  }, [element, disabled, handleScroll, updateScrollPosition])

  // Scroll control functions
  const scrollTo = useCallback((options: { x?: number; y?: number; behavior?: 'auto' | 'smooth' }) => {
    // Handle both HTMLElement and RefObject<HTMLElement>
    const targetElement = element && 'current' in element ? element.current : element
    const scrollTarget = targetElement || window
    const isWindow = scrollTarget === window

    if (isWindow) {
      window.scrollTo({
        left: options.x,
        top: options.y,
        behavior: options.behavior || 'smooth'
      })
    } else {
      const scrollElement = scrollTarget as HTMLElement
      if (options.x !== undefined) {
        scrollElement.scrollLeft = options.x
      }
      if (options.y !== undefined) {
        scrollElement.scrollTop = options.y
      }
      if (options.behavior === 'smooth') {
        scrollElement.scrollTo({
          left: options.x,
          top: options.y,
          behavior: 'smooth'
        })
      }
    }
  }, [element])

  const scrollToTop = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    scrollTo({ y: 0, behavior })
  }, [scrollTo])

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    // Handle both HTMLElement and RefObject<HTMLElement>
    const targetElement = element && 'current' in element ? element.current : element
    const scrollTarget = targetElement || window
    const isWindow = scrollTarget === window
    const scrollElement = isWindow ? document.documentElement : scrollTarget as HTMLElement
    
    scrollTo({ y: scrollElement.scrollHeight, behavior })
  }, [scrollTo, element])

  const scrollToLeft = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    scrollTo({ x: 0, behavior })
  }, [scrollTo])

  const scrollToRight = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    // Handle both HTMLElement and RefObject<HTMLElement>
    const targetElement = element && 'current' in element ? element.current : element
    const scrollTarget = targetElement || window
    const isWindow = scrollTarget === window
    const scrollElement = isWindow ? document.documentElement : scrollTarget as HTMLElement
    
    scrollTo({ x: scrollElement.scrollWidth, behavior })
  }, [scrollTo, element])

  // Computed values
  const isAtTop = scrollPosition.scrollTop <= 1
  const isAtBottom = scrollPosition.scrollTop >= scrollPosition.scrollHeight - scrollPosition.clientHeight - 1
  const isAtLeft = scrollPosition.scrollLeft <= 1
  const isAtRight = scrollPosition.scrollLeft >= scrollPosition.scrollWidth - scrollPosition.clientWidth - 1
  const isNearTop = scrollPosition.scrollTop <= NEAR_THRESHOLD
  const isNearBottom = scrollPosition.scrollTop >= scrollPosition.scrollHeight - scrollPosition.clientHeight - NEAR_THRESHOLD

  return {
    scrollPosition,
    directions,
    isAtTop,
    isAtBottom,
    isAtLeft,
    isAtRight,
    isNearBottom,
    isNearTop,
    scrollTo,
    scrollToTop,
    scrollToBottom,
    scrollToLeft,
    scrollToRight
  }
}