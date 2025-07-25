import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Search, 
  MessageSquare, 
  MoreVertical,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FixedSizeList as List } from 'react-window'

export interface ChatSession {
  id: string
  title: string | null
  document_id: string | null
  created_at: string
  updated_at: string
  messages?: any[]
}

interface ChatHistoryProps {
  sessions: ChatSession[]
  currentSessionId: string | null
  isLoading: boolean
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onRenameSession?: (sessionId: string, newTitle: string) => void
}

// View modes for chat items
type ViewMode = 'compact' | 'expanded'

// Virtual list item data
interface ListItemData {
  type: 'group' | 'session' | 'loadMore'
  groupName?: string
  session?: ChatSession
  index: number
  isSelected?: boolean
  onSelect?: (sessionId: string) => void
  onDelete?: (sessionId: string) => void
  onRename?: (sessionId: string, newTitle: string) => void
  viewMode?: ViewMode
  onToggleExpanded?: (sessionId: string) => void
  isExpanded?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
}

// Constants
const ITEM_HEIGHT = 48 // Compact item height
const EXPANDED_ITEM_HEIGHT = 64 // Expanded item height  
const GROUP_HEADER_HEIGHT = 32
const LOAD_MORE_HEIGHT = 40
const INITIAL_LOAD_COUNT = 20
const LOAD_MORE_COUNT = 20

// Group order for sorting (most recent first)
const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'] as const

// Memoized date formatter
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

// Loading skeleton component
const ChatItemSkeleton = React.memo(() => (
  <div className="px-2 py-1.5 mx-1">
    <div className="flex items-center gap-2 animate-pulse">
      <div className="w-4 h-4 bg-muted rounded flex-shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="h-3.5 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/2" />
      </div>
    </div>
  </div>
))

ChatItemSkeleton.displayName = 'ChatItemSkeleton'

// Virtual list item component
const ListItem = React.memo<{ index: number; style: React.CSSProperties; data: ListItemData[] }>(
  ({ index, style, data }) => {
    const item = data[index]
    
    if (item.type === 'group') {
      return (
        <div style={style}>
          <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {item.groupName}
          </div>
        </div>
      )
    }
    
    if (item.type === 'loadMore') {
      return (
        <div style={style}>
          <div className="px-2 mx-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs text-muted-foreground"
              onClick={item.onLoadMore}
              disabled={!item.hasMore}
            >
              {item.hasMore ? (
                <>
                  <ChevronDown className="w-3 h-3 mr-1" />
                  Show More
                </>
              ) : (
                'No more conversations'
              )}
            </Button>
          </div>
        </div>
      )
    }
    
    if (item.type === 'session' && item.session) {
      return (
        <div style={style}>
          <ChatSessionItem
            session={item.session}
            isSelected={item.isSelected || false}
            viewMode={item.viewMode || 'compact'}
            isExpanded={item.isExpanded || false}
            onSelect={item.onSelect}
            onDelete={item.onDelete}
            onRename={item.onRename}
            onToggleExpanded={item.onToggleExpanded}
          />
        </div>
      )
    }
    
    return <div style={style} />
  }
)

ListItem.displayName = 'ListItem'

// Individual chat session item component
const ChatSessionItem = React.memo<{
  session: ChatSession
  isSelected: boolean
  viewMode: ViewMode
  isExpanded: boolean
  onSelect?: (sessionId: string) => void
  onDelete?: (sessionId: string) => void
  onRename?: (sessionId: string, newTitle: string) => void
  onToggleExpanded?: (sessionId: string) => void
}>(({ session, isSelected, viewMode, isExpanded, onSelect, onDelete, onRename, onToggleExpanded }) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  
  const handleStartEdit = useCallback(() => {
    setEditingSessionId(session.id)
    setEditTitle(session.title || 'Untitled Chat')
  }, [session.id, session.title])

  const handleSaveEdit = useCallback(() => {
    if (editTitle.trim() && onRename) {
      onRename(session.id, editTitle.trim())
    }
    setEditingSessionId(null)
    setEditTitle("")
  }, [session.id, editTitle, onRename])

  const handleCancelEdit = useCallback(() => {
    setEditingSessionId(null)
    setEditTitle("")
  }, [])
  
  // Memoized relative time formatter
  const relativeTime = useMemo(() => {
    const date = new Date(session.updated_at)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d`
    
    return dateFormatter.format(date)
  }, [session.updated_at])

  const title = session.title || 'Untitled Chat'
  const showExpanded = viewMode === 'expanded' || isExpanded

  return (
    <div className={`
      group relative mx-1 rounded-md transition-all duration-200
      ${isSelected 
        ? 'bg-accent text-accent-foreground border border-accent-foreground/20' 
        : 'hover:bg-muted/50'
      }
    `}>
      {editingSessionId === session.id ? (
        // Edit Mode
        <div className="p-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit()
              if (e.key === 'Escape') handleCancelEdit()
            }}
            onBlur={handleSaveEdit}
            className="h-7 text-xs"
            autoFocus
            aria-label="Edit conversation title"
          />
        </div>
      ) : (
        // Display Mode
        <Button
          variant="ghost"
          className="w-full h-auto p-0 justify-start text-left font-normal hover:bg-transparent"
          onClick={() => onSelect?.(session.id)}
          aria-current={isSelected ? 'true' : 'false'}
          aria-label={`${title}, ${relativeTime}`}
        >
          <div className={`flex items-start gap-2 w-full p-2 ${showExpanded ? 'pb-3' : ''}`}>
            <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-60" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={`truncate font-medium ${showExpanded ? 'text-sm' : 'text-xs'}`}>
                  {title}
                </p>
                {onToggleExpanded && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpanded(session.id)
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-2 mt-0.5">
                <time className={`text-muted-foreground ${showExpanded ? 'text-xs' : 'text-xs'}`}>
                  {relativeTime}
                </time>
                {session.document_id && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                    Doc
                  </Badge>
                )}
              </div>
              
              {showExpanded && (
                <div className="mt-1">
                  <p className="text-xs text-muted-foreground">
                    {session.messages?.length || 0} messages
                  </p>
                </div>
              )}
            </div>
          </div>
        </Button>
      )}

      {/* Actions Menu */}
      {editingSessionId !== session.id && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={(e) => e.stopPropagation()}
                aria-label="More actions"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onRename && (
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Edit3 className="h-3 w-3 mr-2" />
                  Rename
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => onDelete?.(session.id)}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
})

ChatSessionItem.displayName = 'ChatSessionItem'

export function ChatHistory({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onDeleteSession,
  onRenameSession
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("compact")
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [displayedCount, setDisplayedCount] = useState(INITIAL_LOAD_COUNT)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const listRef = useRef<List>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(400)

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const availableHeight = window.innerHeight - rect.top - 20 // 20px buffer
        setContainerHeight(Math.max(300, Math.min(600, availableHeight)))
      }
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  // Handle expanding/collapsing sessions
  const handleToggleExpanded = useCallback((sessionId: string) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }, [])

  // Handle loading more sessions
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    
    setIsLoadingMore(true)
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 500))
    setDisplayedCount(prev => prev + LOAD_MORE_COUNT)
    setIsLoadingMore(false)
  }, [isLoadingMore])

  // Filter and group sessions with pagination
  const { virtualListItems, hasMore, totalCount } = useMemo(() => {
    const filtered = sessions.filter(session => {
      if (!searchQuery.trim()) return true
      
      const query = searchQuery.toLowerCase()
      const title = (session.title || 'Untitled Chat').toLowerCase()
      
      return title.includes(query)
    })

    // Group by date
    const grouped = filtered.reduce((groups, session) => {
      const date = new Date(session.created_at)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      
      let groupKey: string
      
      if (date.toDateString() === today.toDateString()) {
        groupKey = 'Today'
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = 'Yesterday'
      } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
        groupKey = 'This Week'
      } else if (date > new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
        groupKey = 'This Month'
      } else {
        groupKey = 'Older'
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(session)
      return groups
    }, {} as Record<string, ChatSession[]>)

    // Sort sessions within each group by updated_at (most recent first)
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
    })

    // Sort groups by predefined order
    const sortedGroups = Object.entries(grouped).sort((a, b) => {
      const indexA = GROUP_ORDER.indexOf(a[0] as typeof GROUP_ORDER[number])
      const indexB = GROUP_ORDER.indexOf(b[0] as typeof GROUP_ORDER[number])
      return indexA - indexB
    })

    // Create virtual list items with pagination
    const listItems: ListItemData[] = []
    let itemIndex = 0
    let sessionCount = 0

    for (const [groupName, groupSessions] of sortedGroups) {
      if (sessionCount >= displayedCount) break

      // Add group header
      listItems.push({
        type: 'group',
        groupName,
        index: itemIndex++
      })

      // Add sessions (limited by displayedCount)
      const remainingSlots = displayedCount - sessionCount
      const sessionsToShow = groupSessions.slice(0, remainingSlots)
      
      for (const session of sessionsToShow) {
        listItems.push({
          type: 'session',
          session,
          index: itemIndex++,
          isSelected: currentSessionId === session.id,
          onSelect: onSelectSession,
          onDelete: onDeleteSession,
          onRename: onRenameSession,
          viewMode,
          isExpanded: expandedSessions.has(session.id),
          onToggleExpanded: handleToggleExpanded
        })
        sessionCount++
      }
    }

    // Add load more button if there are more sessions
    const totalSessionCount = filtered.length
    const hasMoreSessions = sessionCount < totalSessionCount

    if (hasMoreSessions) {
      listItems.push({
        type: 'loadMore',
        index: itemIndex++,
        hasMore: hasMoreSessions,
        onLoadMore: handleLoadMore
      })
    }

    return {
      virtualListItems: listItems,
      hasMore: hasMoreSessions,
      totalCount: totalSessionCount
    }
  }, [sessions, searchQuery, displayedCount, currentSessionId, viewMode, expandedSessions, onSelectSession, onDeleteSession, onRenameSession, handleToggleExpanded, handleLoadMore])

  // Reset displayed count when search changes
  useEffect(() => {
    setDisplayedCount(INITIAL_LOAD_COUNT)
    setExpandedSessions(new Set())
  }, [searchQuery])

  // Calculate item height dynamically
  const getItemHeight = useCallback((index: number) => {
    const item = virtualListItems[index]
    if (item?.type === 'group') return GROUP_HEADER_HEIGHT
    if (item?.type === 'loadMore') return LOAD_MORE_HEIGHT
    if (item?.type === 'session') {
      const isExpanded = item.isExpanded || item.viewMode === 'expanded'
      return isExpanded ? EXPANDED_ITEM_HEIGHT : ITEM_HEIGHT
    }
    return ITEM_HEIGHT
  }, [virtualListItems])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b">
          <div className="h-8 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex-1 p-2 space-y-2" role="status" aria-label="Loading conversations">
          {[...Array(6)].map((_, i) => (
            <ChatItemSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Search Header */}
      <div className="flex-shrink-0 p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
            aria-label="Search conversations"
          />
        </div>
        {searchQuery && (
          <div className="mt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
            {totalCount} result{totalCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className="flex-shrink-0 px-2 py-1 border-b">
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setViewMode('compact')}
          >
            Compact
          </Button>
          <Button
            variant={viewMode === 'expanded' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setViewMode('expanded')}
          >
            Detailed
          </Button>
        </div>
      </div>

      {/* Chat Sessions List */}
      <div className="flex-1 min-h-0" role="navigation" aria-label="Conversation history">
        {virtualListItems.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          <List
            ref={listRef}
            height={containerHeight - 80} // Account for header heights
            itemCount={virtualListItems.length}
            itemSize={viewMode === 'compact' ? 48 : 64}
            itemData={virtualListItems}
            overscanCount={5}
            style={{ overflow: 'auto' }}
          >
            {ListItem}
          </List>
        )}
      </div>

      {/* Loading indicator for load more */}
      {isLoadingMore && (
        <div className="flex-shrink-0 p-2 text-center">
          <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
        </div>
      )}
    </div>
  )
}