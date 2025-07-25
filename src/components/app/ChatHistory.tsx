import React, { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Search, 
  MessageSquare, 
  MoreVertical,
  Trash2,
  Edit3,
  Calendar,
  Clock
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

// Group order for sorting (most recent first)
const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'] as const

// Memoized date formatter
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
})

export function ChatHistory({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onDeleteSession,
  onRenameSession
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")

  // Filter and group sessions
  const { filteredSessions, sortedGroups } = useMemo(() => {
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
    const sorted = Object.entries(grouped).sort((a, b) => {
      const indexA = GROUP_ORDER.indexOf(a[0] as typeof GROUP_ORDER[number])
      const indexB = GROUP_ORDER.indexOf(b[0] as typeof GROUP_ORDER[number])
      return indexA - indexB
    })

    return { filteredSessions: filtered, sortedGroups: sorted }
  }, [sessions, searchQuery])

  // Memoized relative time formatter
  const formatRelativeTime = useMemo(() => {
    return (dateString: string) => {
      const date = new Date(dateString)
      const now = new Date()
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
      
      if (diffInMinutes < 1) return 'Just now'
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`
      if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
      if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`
      
      return dateFormatter.format(date)
    }
  }, [])

  const handleStartEdit = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditTitle(session.title || 'Untitled Chat')
  }

  const handleSaveEdit = () => {
    if (editingSessionId && editTitle.trim() && onRenameSession) {
      onRenameSession(editingSessionId, editTitle.trim())
    }
    setEditingSessionId(null)
    setEditTitle("")
  }

  const handleCancelEdit = () => {
    setEditingSessionId(null)
    setEditTitle("")
  }

  if (isLoading) {
    return (
      <div className="p-4" role="status" aria-label="Loading conversations">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={`skeleton-${i}`} className="animate-pulse">
              <div className="h-12 bg-muted rounded-md"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Header */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
            aria-label="Search conversations"
          />
        </div>
        {searchQuery && (
          <div className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            {filteredSessions.length} result{filteredSessions.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Chat Sessions */}
      <div className="flex-1 overflow-y-auto" role="navigation" aria-label="Conversation history">
        {sortedGroups.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          sortedGroups.map(([group, groupSessions]) => (
            <div key={group} className="py-2">
              {/* Group Header */}
              <h3 className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {group}
              </h3>
              
              {/* Sessions in Group */}
              <div className="space-y-1" role="list">
                {groupSessions.map((session) => (
                  <div
                    key={session.id}
                    role="listitem"
                    className={`
                      group relative mx-2 rounded-md transition-colors
                      ${currentSessionId === session.id 
                        ? 'bg-accent text-accent-foreground' 
                        : 'hover:bg-muted/50'
                      }
                    `}
                  >
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
                          className="h-8 text-sm"
                          autoFocus
                          aria-label="Edit conversation title"
                        />
                      </div>
                    ) : (
                      // Display Mode
                      <Button
                        variant="ghost"
                        className="w-full h-auto p-2 justify-start text-left font-normal"
                        onClick={() => onSelectSession(session.id)}
                        aria-current={currentSessionId === session.id ? 'true' : 'false'}
                        aria-label={`${session.title || 'Untitled Chat'}, ${formatRelativeTime(session.updated_at)}`}
                      >
                        <div className="flex items-start gap-2 w-full">
                          <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">
                              {session.title || 'Untitled Chat'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <time className="text-xs text-muted-foreground">
                                {formatRelativeTime(session.updated_at)}
                              </time>
                              {session.document_id && (
                                <Badge variant="secondary" className="text-xs px-1 py-0">
                                  Doc
                                </Badge>
                              )}
                            </div>
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
                              className="h-6 w-6 p-0"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="More actions"
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onRenameSession && (
                              <DropdownMenuItem onClick={() => handleStartEdit(session)}>
                                <Edit3 className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => onDeleteSession(session.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}