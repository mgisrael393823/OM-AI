import * as React from "react"
import { FixedSizeList as List, VariableSizeList, ListChildComponentProps, FixedSizeListProps, VariableSizeListProps } from 'react-window'
import { cn } from "@/lib/utils"
import { useScrollPosition } from "@/hooks/useScrollPosition"
import { ScrollContainer } from "./scroll-container"

// Common props for all virtual lists
interface BaseVirtualListProps {
  children: React.ComponentType<ListChildComponentProps>
  className?: string
  itemData?: any[]
  overscanCount?: number
  direction?: 'vertical' | 'horizontal'
  scrollRestoration?: boolean
  scrollKey?: string
  onScroll?: (scrollTop: number, scrollLeft: number) => void
  onItemsRendered?: (startIndex: number, stopIndex: number) => void
  onReachEnd?: () => void
  onReachStart?: () => void
  infiniteLoad?: boolean
  loading?: boolean
  hasNextPage?: boolean
  loadMore?: () => void
}

// Fixed size list props
export interface VirtualScrollListProps extends BaseVirtualListProps {
  height: number
  width?: number | string
  itemCount: number
  itemSize: number
  layout?: 'vertical' | 'horizontal'
}

// Variable size list props
export interface VariableVirtualScrollListProps extends BaseVirtualListProps {
  height: number
  width?: number | string
  itemCount: number
  itemSize: (index: number) => number
  estimatedItemSize?: number
}

// Loading component
const DefaultLoadingComponent: React.FC = () => (
  <div className="flex items-center justify-center p-4">
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
  </div>
)

// Empty state component
const DefaultEmptyComponent: React.FC = () => (
  <div className="flex flex-col items-center justify-center p-8 text-center">
    <div className="text-2xl text-muted-foreground mb-2">📝</div>
    <p className="text-muted-foreground">No items to display</p>
  </div>
)

// Fixed size virtual list
const VirtualScrollList = React.forwardRef<List, VirtualScrollListProps>(
  ({
    children,
    className,
    height,
    width = "100%",
    itemCount,
    itemSize,
    itemData = [],
    overscanCount = 5,
    layout = 'vertical',
    scrollRestoration = false,
    scrollKey,
    onScroll,
    onItemsRendered,
    onReachEnd,
    onReachStart,
    infiniteLoad = false,
    loading = false,
    hasNextPage = false,
    loadMore,
    ...props
  }, ref) => {
    const listRef = React.useRef<List>(null)
    const [isNearEnd, setIsNearEnd] = React.useState(false)
    const [isNearStart, setIsNearStart] = React.useState(false)

    // Combine refs
    React.useImperativeHandle(ref, () => listRef.current!, [])

    // Handle infinite loading
    React.useEffect(() => {
      if (infiniteLoad && isNearEnd && !loading && hasNextPage && loadMore) {
        loadMore()
      }
    }, [infiniteLoad, isNearEnd, loading, hasNextPage, loadMore])

    // Custom scroll handler
    const handleScroll = React.useCallback((scrollInfo: any) => {
      const { scrollOffset, scrollDirection } = scrollInfo
      onScroll?.(scrollOffset, 0)

      // Calculate if near end or start
      const threshold = itemSize * 3 // 3 items from edge
      const maxScroll = Math.max(0, (itemCount * itemSize) - height)
      
      setIsNearEnd(scrollOffset >= maxScroll - threshold)
      setIsNearStart(scrollOffset <= threshold)

      // Trigger callbacks
      if (scrollOffset >= maxScroll - threshold) {
        onReachEnd?.()
      }
      if (scrollOffset <= threshold) {
        onReachStart?.()
      }
    }, [onScroll, onReachEnd, onReachStart, itemSize, itemCount, height])

    // Items rendered handler with infinite loading
    const handleItemsRendered = React.useCallback((info: any) => {
      onItemsRendered?.(info.visibleStartIndex, info.visibleStopIndex)
      
      if (infiniteLoad && !loading && hasNextPage) {
        const { visibleStopIndex } = info
        const threshold = Math.max(1, overscanCount)
        
        if (visibleStopIndex >= itemCount - threshold) {
          loadMore?.()
        }
      }
    }, [onItemsRendered, infiniteLoad, loading, hasNextPage, loadMore, itemCount, overscanCount])

    // Scroll restoration
    React.useEffect(() => {
      if (!scrollRestoration || !scrollKey || !listRef.current) return

      const savedOffset = sessionStorage.getItem(`virtual-scroll-${scrollKey}`)
      if (savedOffset) {
        listRef.current.scrollTo(parseInt(savedOffset, 10))
      }

      return () => {
        if (listRef.current) {
          // Access scroll offset through the outer ref's scrollTop property
          const outerRef = (listRef.current as any)._outerRef
          const currentOffset = outerRef?.scrollTop || 0
          sessionStorage.setItem(`virtual-scroll-${scrollKey}`, currentOffset.toString())
        }
      }
    }, [scrollKey, scrollRestoration])

    // Enhanced child wrapper for loading states
    const ItemWrapper: React.FC<ListChildComponentProps> = React.useCallback((itemProps) => {
      const { index, style } = itemProps
      
      // Show loading at the end if infinite loading
      if (infiniteLoad && loading && index === itemCount) {
        return (
          <div style={style}>
            <DefaultLoadingComponent />
          </div>
        )
      }

      return React.createElement(children, itemProps)
    }, [children, infiniteLoad, loading, itemCount])

    // Empty state
    if (itemCount === 0 && !loading) {
      return (
        <div className={cn("flex items-center justify-center", className)} style={{ height }}>
          <DefaultEmptyComponent />
        </div>
      )
    }

    // Adjust item count for infinite loading
    const adjustedItemCount = infiniteLoad && loading ? itemCount + 1 : itemCount

    return (
      <div className={cn("virtual-scroll-list", className)}>
        <List
          ref={listRef}
          height={height}
          width={width}
          itemCount={adjustedItemCount}
          itemSize={itemSize}
          itemData={itemData}
          overscanCount={overscanCount}
          layout={layout}
          onScroll={handleScroll}
          onItemsRendered={handleItemsRendered}
          {...props}
        >
          {ItemWrapper}
        </List>
      </div>
    )
  }
)

VirtualScrollList.displayName = "VirtualScrollList"

// Variable size virtual list
const VariableVirtualScrollList = React.forwardRef<VariableSizeList, VariableVirtualScrollListProps>(
  ({
    children,
    className,
    height,
    width = "100%",
    itemCount,
    itemSize,
    estimatedItemSize = 50,
    itemData = [],
    overscanCount = 5,
    scrollRestoration = false,
    scrollKey,
    onScroll,
    onItemsRendered,
    onReachEnd,
    onReachStart,
    infiniteLoad = false,
    loading = false,
    hasNextPage = false,
    loadMore,
    ...props
  }, ref) => {
    const listRef = React.useRef<VariableSizeList>(null)

    // Combine refs
    React.useImperativeHandle(ref, () => listRef.current!, [])

    // Custom scroll handler
    const handleScroll = React.useCallback((scrollInfo: any) => {
      const { scrollOffset } = scrollInfo
      onScroll?.(scrollOffset, 0)
      
      // Note: For variable size, calculating "near end" is more complex
      // We'll use a simpler approach based on scroll percentage
      const element = listRef.current?.state
      if (element) {
        const { scrollHeight, clientHeight } = (listRef.current as any)._outerRef
        const scrollPercentage = scrollOffset / (scrollHeight - clientHeight)
        
        if (scrollPercentage >= 0.9) {
          onReachEnd?.()
        }
        if (scrollPercentage <= 0.1) {
          onReachStart?.()
        }
      }
    }, [onScroll, onReachEnd, onReachStart])

    // Items rendered handler
    const handleItemsRendered = React.useCallback((info: any) => {
      onItemsRendered?.(info.visibleStartIndex, info.visibleStopIndex)
      
      if (infiniteLoad && !loading && hasNextPage) {
        const { visibleStopIndex } = info
        const threshold = Math.max(1, overscanCount)
        
        if (visibleStopIndex >= itemCount - threshold) {
          loadMore?.()
        }
      }
    }, [onItemsRendered, infiniteLoad, loading, hasNextPage, loadMore, itemCount, overscanCount])

    // Enhanced child wrapper
    const ItemWrapper: React.FC<ListChildComponentProps> = React.useCallback((itemProps) => {
      const { index } = itemProps
      
      if (infiniteLoad && loading && index === itemCount) {
        return (
          <div style={itemProps.style}>
            <DefaultLoadingComponent />
          </div>
        )
      }

      return React.createElement(children, itemProps)
    }, [children, infiniteLoad, loading, itemCount])

    // Empty state
    if (itemCount === 0 && !loading) {
      return (
        <div className={cn("flex items-center justify-center", className)} style={{ height }}>
          <DefaultEmptyComponent />
        </div>
      )
    }

    const adjustedItemCount = infiniteLoad && loading ? itemCount + 1 : itemCount

    return (
      <div className={cn("variable-virtual-scroll-list", className)}>
        <VariableSizeList
          ref={listRef}
          height={height}
          width={width}
          itemCount={adjustedItemCount}
          itemSize={itemSize}
          estimatedItemSize={estimatedItemSize}
          itemData={itemData}
          overscanCount={overscanCount}
          onScroll={handleScroll}
          onItemsRendered={handleItemsRendered}
          {...props}
        >
          {ItemWrapper}
        </VariableSizeList>
      </div>
    )
  }
)

VariableVirtualScrollList.displayName = "VariableVirtualScrollList"

// Utility hook for virtual list control
export function useVirtualListControl(listRef: React.RefObject<List | VariableSizeList>) {
  const scrollToItem = React.useCallback((index: number, align: 'auto' | 'smart' | 'center' | 'end' | 'start' = 'auto') => {
    if (listRef.current) {
      listRef.current.scrollToItem(index, align)
    }
  }, [listRef])

  const scrollTo = React.useCallback((scrollOffset: number) => {
    if (listRef.current) {
      listRef.current.scrollTo(scrollOffset)
    }
  }, [listRef])

  const scrollToTop = React.useCallback(() => {
    scrollTo(0)
  }, [scrollTo])

  const scrollToBottom = React.useCallback(() => {
    if (listRef.current) {
      const element = (listRef.current as any)._outerRef
      if (element) {
        scrollTo(element.scrollHeight)
      }
    }
  }, [scrollTo])

  return {
    scrollToItem,
    scrollTo,
    scrollToTop,
    scrollToBottom
  }
}

export { VirtualScrollList, VariableVirtualScrollList }