import * as React from "react"
import { ChevronDown, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useScrollPosition } from "@/hooks/useScrollPosition"

export interface ScrollToBottomProps {
  target?: React.RefObject<HTMLElement> | HTMLElement | null
  threshold?: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center'
  offset?: { x?: number; y?: number }
  showUnreadCount?: boolean
  unreadCount?: number
  icon?: 'chevron' | 'arrow' | React.ReactNode
  label?: string
  showLabel?: boolean
  autoHide?: boolean
  fadeDelay?: number
  animateOnClick?: boolean
  onClick?: () => void
  onShow?: () => void
  onHide?: () => void
}

const ScrollToBottom = React.forwardRef<HTMLButtonElement, ScrollToBottomProps>(
  ({
    target,
    threshold = 100,
    className,
    size = 'md',
    variant = 'default',
    position = 'bottom-right',
    offset = { x: 16, y: 16 },
    showUnreadCount = false,
    unreadCount = 0,
    icon = 'chevron',
    label = 'Scroll to bottom',
    showLabel = false,
    autoHide = true,
    fadeDelay = 2000,
    animateOnClick = true,
    onClick,
    onShow,
    onHide,
    ...props
  }, ref) => {
    const [isVisible, setIsVisible] = React.useState(false)
    const [isAnimating, setIsAnimating] = React.useState(false)
    const fadeTimeoutRef = React.useRef<number>()
    const targetElement = target && 'current' in target ? target.current : target

    const { isNearBottom, scrollToBottom, scrollPosition } = useScrollPosition({
      element: targetElement || null
    })

    // Handle visibility updates separately to avoid dependency loop
    React.useEffect(() => {
      const shouldShow = !isNearBottom && scrollPosition.scrollTop > threshold
      
      if (shouldShow !== isVisible) {
        setIsVisible(shouldShow)
        if (shouldShow) {
          onShow?.()
        } else {
          onHide?.()
        }
      }

      // Auto-hide after delay when not scrolling
      if (autoHide && shouldShow) {
        if (fadeTimeoutRef.current) {
          clearTimeout(fadeTimeoutRef.current)
        }
        
        fadeTimeoutRef.current = window.setTimeout(() => {
          if (!isNearBottom) {
            setIsVisible(false)
            onHide?.()
          }
        }, fadeDelay)
      }
    }, [isNearBottom, scrollPosition.scrollTop, threshold, isVisible, autoHide, fadeDelay, onShow, onHide])

    // Cleanup timeout on unmount
    React.useEffect(() => {
      return () => {
        if (fadeTimeoutRef.current) {
          clearTimeout(fadeTimeoutRef.current)
        }
      }
    }, [])

    const handleClick = React.useCallback(() => {
      if (animateOnClick) {
        setIsAnimating(true)
        setTimeout(() => setIsAnimating(false), 300)
      }

      scrollToBottom('smooth')
      onClick?.()
      
      // Hide immediately after clicking
      if (autoHide) {
        setIsVisible(false)
        onHide?.()
      }
    }, [animateOnClick, autoHide, onClick, onHide, scrollToBottom])

    // Don't render if not visible
    if (!isVisible) return null

    // Size configurations
    const sizeConfig = {
      sm: {
        button: 'h-8 w-8',
        icon: 'h-3 w-3',
        badge: 'h-4 min-w-[16px] text-xs',
        badgeOffset: '-top-1 -right-1'
      },
      md: {
        button: 'h-10 w-10',
        icon: 'h-4 w-4',
        badge: 'h-5 min-w-[20px] text-xs',
        badgeOffset: '-top-2 -right-2'
      },
      lg: {
        button: 'h-12 w-12',
        icon: 'h-5 w-5',
        badge: 'h-6 min-w-[24px] text-sm',
        badgeOffset: '-top-2 -right-2'
      }
    }

    // Position configurations
    const positionConfig = {
      'bottom-right': `bottom-[${offset.y}px] right-[${offset.x}px]`,
      'bottom-left': `bottom-[${offset.y}px] left-[${offset.x}px]`,
      'bottom-center': `bottom-[${offset.y}px] left-1/2 transform -translate-x-1/2`
    }

    // Icon rendering
    const renderIcon = () => {
      if (React.isValidElement(icon)) {
        return React.cloneElement(icon as React.ReactElement, {
          className: cn(sizeConfig[size].icon, (icon as React.ReactElement).props?.className)
        })
      }
      
      switch (icon) {
        case 'arrow':
          return <ArrowDown className={sizeConfig[size].icon} />
        case 'chevron':
        default:
          return <ChevronDown className={sizeConfig[size].icon} />
      }
    }

    return (
      <div
        className={cn(
          "fixed z-50 transition-all duration-300 ease-in-out",
          positionConfig[position],
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          className
        )}
      >
        <div className="relative">
          <Button
            ref={ref}
            variant={variant}
            size="icon"
            className={cn(
              sizeConfig[size].button,
              "rounded-full shadow-lg hover:shadow-xl transition-all duration-200",
              "backdrop-blur-sm bg-background/80 hover:bg-background/90",
              "border border-border/50",
              isAnimating && "animate-bounce",
              showLabel && "group"
            )}
            onClick={handleClick}
            aria-label={label}
            {...props}
          >
            {renderIcon()}
            
            {/* Unread count badge */}
            {showUnreadCount && unreadCount > 0 && (
              <div
                className={cn(
                  "absolute flex items-center justify-center rounded-full bg-primary text-primary-foreground font-medium",
                  sizeConfig[size].badge,
                  sizeConfig[size].badgeOffset
                )}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </Button>

          {/* Label tooltip */}
          {showLabel && (
            <div
              className={cn(
                "absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2",
                "px-2 py-1 text-xs font-medium text-foreground bg-background",
                "rounded border border-border shadow-md",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                "pointer-events-none whitespace-nowrap"
              )}
            >
              {label}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border" />
            </div>
          )}
        </div>
      </div>
    )
  }
)

ScrollToBottom.displayName = "ScrollToBottom"

// Utility hook for managing scroll to bottom behavior
export function useScrollToBottom(options: {
  target?: React.RefObject<HTMLElement> | HTMLElement | null
  threshold?: number
  autoScroll?: boolean
  onNewMessage?: () => void
}) {
  const { target, threshold = 100, autoScroll = true, onNewMessage } = options
  const targetElement = target && 'current' in target ? target.current : target
  
  const { isNearBottom, scrollToBottom } = useScrollPosition({
    element: targetElement || null
  })

  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(autoScroll)

  // Auto-scroll when new messages arrive if user is near bottom
  // Note: Removed isNearBottom from dependencies to prevent infinite loop
  React.useEffect(() => {
    if (autoScroll && shouldAutoScroll && isNearBottom) {
      scrollToBottom('smooth')
      onNewMessage?.()
    }
  }, [autoScroll, shouldAutoScroll, onNewMessage]) // Removed isNearBottom and scrollToBottom to prevent loops

  // Disable auto-scroll when user manually scrolls up
  React.useEffect(() => {
    if (!isNearBottom) {
      setShouldAutoScroll(false)
    } else {
      setShouldAutoScroll(true)
    }
  }, [isNearBottom])

  const scrollToBottomManually = React.useCallback(() => {
    scrollToBottom('smooth')
    setShouldAutoScroll(true)
  }, [scrollToBottom])

  return {
    isNearBottom,
    shouldAutoScroll,
    scrollToBottom: scrollToBottomManually,
    enableAutoScroll: () => setShouldAutoScroll(true),
    disableAutoScroll: () => setShouldAutoScroll(false)
  }
}

export { ScrollToBottom }