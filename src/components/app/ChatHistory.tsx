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
import { VariableSizeList as List } from 'react-window'

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
  isCollapsed?: boolean
}


// Virtual list item data
interface ListItemData {
  type: 'session' | 'loadMore'
  session?: ChatSession
  index: number
  isSelected?: boolean
  onSelect?: (sessionId: string) => void
  onDelete?: (sessionId: string) => void
  onRename?: (sessionId: string, newTitle: string) => void
  onToggleExpanded?: (sessionId: string) => void
  isExpanded?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
}

// Constants
const ITEM_HEIGHT = 56 // Compact item height (includes p-1 wrapper)
const EXPANDED_ITEM_HEIGHT = 72 // Expanded item height (includes p-1 wrapper)
const LOAD_MORE_HEIGHT = 48 // Load more height (includes p-1 wrapper)
const INITIAL_LOAD_COUNT = 20
const LOAD_MORE_COUNT = 20


// Memoized date formatter
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

// Loading skeleton component
const ChatItemSkeleton = React.memo(() => (
  <div className="grid grid-cols-1 p-1">
    <div className="grid grid-cols-1 gap-2 animate-pulse p-2">
      <div className="grid grid-rows-2 gap-1">
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
    
    if (item.type === 'loadMore') {
      return (
        <div style={style} className="grid grid-cols-1 p-2">
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
      )
    }
    
    if (item.type === 'session' && item.session) {
      return (
        <div style={style}>
          <ChatSessionItem
            session={item.session}
            isSelected={item.isSelected || false}
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
  isExpanded: boolean
  onSelect?: (sessionId: string) => void
  onDelete?: (sessionId: string) => void
  onRename?: (sessionId: string, newTitle: string) => void
  onToggleExpanded?: (sessionId: string) => void
}>(({ session, isSelected, isExpanded, onSelect, onDelete, onRename, onToggleExpanded }) => {
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

  return (
    <div className="grid grid-cols-1 p-1">
      <div className={`
        group relative rounded-md transition-colors duration-200
        ${isSelected 
          ? 'bg-accent text-accent-foreground' 
          : 'hover:bg-muted/10'
        }
      `}>
        {editingSessionId === session.id ? (
          // Edit Mode
          <div className="grid grid-cols-1 p-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') handleCancelEdit()
              }}
              onBlur={handleSaveEdit}
              className="h-8 text-xs"
              autoFocus
              aria-label="Edit conversation title"
            />
          </div>
        ) : (
          // Display Mode
          <div 
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset rounded-md"
            onClick={() => onSelect?.(session.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(session.id)
              }
            }}
            aria-current={isSelected ? 'true' : 'false'}
            aria-label={`${title}, ${relativeTime}`}
          >
            <div className="grid grid-cols-[1fr_auto] gap-2 p-2">
              {/* Content Column */}
              <div className="grid grid-rows-auto gap-1 min-w-0">
                {/* Title Row */}
                <p className="truncate text-sm text-muted-foreground">
                  {title}
                </p>
                
                {/* Metadata Row */}
                <div className="flex items-center gap-2">
                  <time className="text-xs text-muted-foreground">
                    {relativeTime}
                  </time>
                  {session.document_id && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                      Doc
                    </Badge>
                  )}
                </div>
                
                {/* Expanded Details Row */}
                {isExpanded && (
                  <p className="text-xs text-muted-foreground">
                    {session.messages?.length || 0} messages
                  </p>
                )}
              </div>
              
              {/* Actions Column */}
              <div className="flex items-start">
                {onToggleExpanded && (
                  <button
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-60 hover:opacity-100 rounded flex items-center justify-center transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpanded(session.id)
                    }}
                    aria-label={isExpanded ? "Collapse details" : "Expand details"}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions Menu */}
        {editingSessionId !== session.id && (
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-5 w-5 p-0 rounded hover:bg-accent flex items-center justify-center transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="More actions"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
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
  onRenameSession,
  isCollapsed = false
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("")
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
    setIsLoadingMore(true)
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 500))
    setDisplayedCount(prev => prev + LOAD_MORE_COUNT)
    setIsLoadingMore(false)
  }, [])

  // Filter and sort sessions with pagination (flat list)
  const { virtualListItems, hasMore, totalCount } = useMemo(() => {
    const filtered = sessions.filter(session => {
      if (!searchQuery.trim()) return true
      
      const query = searchQuery.toLowerCase()
      const title = (session.title || 'Untitled Chat').toLowerCase()
      
      return title.includes(query)
    })

    // Sort sessions by updated_at (most recent first)
    const sortedSessions = filtered.sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

    // Create virtual list items with pagination
    const listItems: ListItemData[] = []
    let itemIndex = 0

    // Add sessions (limited by displayedCount)
    const sessionsToShow = sortedSessions.slice(0, displayedCount)
    
    for (const session of sessionsToShow) {
      listItems.push({
        type: 'session',
        session,
        index: itemIndex++,
        isSelected: currentSessionId === session.id,
        onSelect: onSelectSession,
        onDelete: onDeleteSession,
        onRename: onRenameSession,
        isExpanded: expandedSessions.has(session.id),
        onToggleExpanded: handleToggleExpanded
      })
    }

    // Add load more button if there are more sessions
    const totalSessionCount = filtered.length
    const hasMoreSessions = sessionsToShow.length < totalSessionCount

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
  }, [sessions, searchQuery, displayedCount, currentSessionId, expandedSessions, onSelectSession, onDeleteSession, onRenameSession, handleToggleExpanded, handleLoadMore])

  // Reset displayed count when search changes
  useEffect(() => {
    setDisplayedCount(INITIAL_LOAD_COUNT)
    setExpandedSessions(new Set())
  }, [searchQuery])

  // Calculate item height dynamically
  const getItemHeight = useCallback((index: number) => {
    const item = virtualListItems[index]
    if (item?.type === 'loadMore') return LOAD_MORE_HEIGHT
    if (item?.type === 'session') {
      const isExpanded = item.isExpanded || false
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
        <div className="flex-1 grid grid-cols-1 gap-2 p-2" role="status" aria-label="Loading conversations">
          {[...Array(6)].map((_, i) => (
            <ChatItemSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Header Section - Hidden when collapsed */}
      {!isCollapsed && (
        <div className="grid grid-rows-1 border-b border-muted">
          {/* Search Row */}
          <div className="grid grid-cols-1 p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs border-0 bg-transparent hover:bg-muted/10 focus:bg-background focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                aria-label="Search conversations"
              />
            </div>
            {searchQuery && (
              <div className="mt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
                {totalCount} result{totalCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Sessions List */}
      <div className="flex-1 min-h-0" role="navigation" aria-label="Conversation history">
        {isCollapsed ? (
          /* Collapsed: Hide all chat sessions to match ChatGPT behavior */
          <div className="flex-1" />
        ) : virtualListItems.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          <List
            ref={listRef}
            height={containerHeight - (isCollapsed ? 0 : 48)} // Account for header when not collapsed
            width="100%"
            itemCount={virtualListItems.length}
            itemSize={getItemHeight}
            itemData={virtualListItems}
            overscanCount={5}
            style={{ overflow: 'auto' }}
          >
            {ListItem}
          </List>
        )}
      </div>

      {/* Loading indicator for load more */}
      {!isCollapsed && isLoadingMore && (
        <div className="flex-shrink-0 p-2 text-center">
          <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
        </div>
      )}
    </div>
  )
}