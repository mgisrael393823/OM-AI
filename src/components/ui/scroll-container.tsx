import * as React from "react"
import { cn } from "@/lib/utils"
import { useScrollPosition } from "@/hooks/useScrollPosition"

export interface ScrollContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  orientation?: 'vertical' | 'horizontal' | 'both'
  hideScrollbars?: boolean
  autoHide?: boolean
  fadeTimeout?: number
  smoothScrolling?: boolean
  momentumScrolling?: boolean
  scrollRestoration?: boolean
  scrollKey?: string
  onScrollStart?: () => void
  onScrollEnd?: () => void
  onReachTop?: () => void
  onReachBottom?: () => void
  onReachLeft?: () => void
  onReachRight?: () => void
}

const ScrollContainer = React.forwardRef<HTMLDivElement, ScrollContainerProps>(
  ({
    children,
    className,
    orientation = 'vertical',
    hideScrollbars = false,
    autoHide = true,
    fadeTimeout = 1000,
    smoothScrolling = true,
    momentumScrolling = true,
    scrollRestoration = false,
    scrollKey,
    onScrollStart,
    onScrollEnd,
    onReachTop,
    onReachBottom,
    onReachLeft,
    onReachRight,
    ...props
  }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const scrollTimeoutRef = React.useRef<number>()
    const isScrollingRef = React.useRef(false)
    const [isVisible, setIsVisible] = React.useState(!autoHide)

    // Combine refs
    React.useImperativeHandle(ref, () => containerRef.current!, [])

    const {
      scrollPosition,
      directions,
      isAtTop,
      isAtBottom,
      isAtLeft,
      isAtRight,
      scrollTo,
      scrollToTop,
      scrollToBottom
    } = useScrollPosition({
      element: containerRef.current,
      onScroll: (position, dirs) => {
        // Handle scroll start/end
        if (!isScrollingRef.current) {
          isScrollingRef.current = true
          onScrollStart?.()
          if (autoHide) setIsVisible(true)
        }

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }

        // Set timeout for scroll end
        scrollTimeoutRef.current = window.setTimeout(() => {
          isScrollingRef.current = false
          onScrollEnd?.()
          if (autoHide) setIsVisible(false)
        }, fadeTimeout)

        // Handle reach callbacks
        if (isAtTop && dirs.isScrollingUp) onReachTop?.()
        if (isAtBottom && dirs.isScrollingDown) onReachBottom?.()
        if (isAtLeft && dirs.isScrollingLeft) onReachLeft?.()
        if (isAtRight && dirs.isScrollingRight) onReachRight?.()
      }
    })

    // Scroll restoration
    React.useEffect(() => {
      if (!scrollRestoration || !scrollKey) return

      const savedPosition = sessionStorage.getItem(`scroll-${scrollKey}`)
      if (savedPosition) {
        const { x, y } = JSON.parse(savedPosition)
        scrollTo({ x, y, behavior: 'auto' })
      }

      return () => {
        if (containerRef.current) {
          sessionStorage.setItem(`scroll-${scrollKey}`, JSON.stringify({
            x: scrollPosition.scrollLeft,
            y: scrollPosition.scrollTop
          }))
        }
      }
    }, [scrollKey, scrollRestoration, scrollPosition, scrollTo])

    // Mouse enter/leave for auto-hide
    const handleMouseEnter = React.useCallback(() => {
      if (autoHide) setIsVisible(true)
    }, [autoHide])

    const handleMouseLeave = React.useCallback(() => {
      if (autoHide && !isScrollingRef.current) setIsVisible(false)
    }, [autoHide])

    const scrollbarStyles = React.useMemo(() => {
      const baseStyles = {
        // Webkit browsers
        '&::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'hsl(var(--border))',
          borderRadius: '4px',
          transition: 'background-color 0.2s ease',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'hsl(var(--border) / 0.8)',
        },
        '&::-webkit-scrollbar-corner': {
          background: 'transparent',
        },
      }

      if (hideScrollbars) {
        return {
          ...baseStyles,
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          scrollbarWidth: 'none' as const,
          msOverflowStyle: 'none' as const,
        }
      }

      if (autoHide) {
        return {
          ...baseStyles,
          '&::-webkit-scrollbar-thumb': {
            background: isVisible ? 'hsl(var(--border))' : 'transparent',
            transition: 'background-color 0.3s ease',
          },
        }
      }

      return baseStyles
    }, [hideScrollbars, autoHide, isVisible])

    const orientationClasses = {
      vertical: 'overflow-y-auto overflow-x-hidden',
      horizontal: 'overflow-x-auto overflow-y-hidden',
      both: 'overflow-auto'
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          // Base styles
          'relative',
          orientationClasses[orientation],
          // Smooth scrolling
          smoothScrolling && 'scroll-smooth',
          // Momentum scrolling for mobile
          momentumScrolling && 'scroll-momentum',
          className
        )}
        style={{
          ...scrollbarStyles,
          // Custom CSS for momentum scrolling on mobile
          WebkitOverflowScrolling: momentumScrolling ? 'touch' : 'auto',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ScrollContainer.displayName = "ScrollContainer"

// Export additional utility components
export interface ScrollAreaProps extends ScrollContainerProps {
  viewportClassName?: string
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ children, className, viewportClassName, ...props }, ref) => (
    <div className={cn("relative overflow-hidden", className)}>
      <ScrollContainer
        ref={ref}
        className={cn("h-full w-full", viewportClassName)}
        {...props}
      >
        {children}
      </ScrollContainer>
    </div>
  )
)

ScrollArea.displayName = "ScrollArea"

export { ScrollContainer, ScrollArea }

// CSS to be added to globals.css
export const scrollContainerCSS = `
/* Smooth momentum scrolling */
.scroll-momentum {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

/* Custom scrollbar for Firefox */
.scroll-container {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.scroll-container:hover {
  scrollbar-color: hsl(var(--border) / 0.8) transparent;
}

/* Hide scrollbars when specified */
.scroll-container-hidden {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scroll-container-hidden::-webkit-scrollbar {
  display: none;
}

/* Ensure proper touch scrolling on mobile */
@media (hover: none) {
  .scroll-container {
    -webkit-overflow-scrolling: touch;
  }
}
`