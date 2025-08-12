import React from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Building2, Settings, X, Plus } from 'lucide-react'
import { ChatHistory } from './ChatHistory'
import { componentTypography } from '@/lib/typography'
import { useRouter } from 'next/router'
import { ChatSession, UserData } from './types'

interface ChatSidebarProps {
  isOpen: boolean
  onClose: () => void
  chatSessions: ChatSession[]
  currentSessionId: string | null
  isLoadingHistory: boolean
  userData: UserData
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newTitle: string) => void
}

export function ChatSidebar({
  isOpen,
  onClose,
  chatSessions,
  currentSessionId,
  isLoadingHistory,
  userData,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession
}: ChatSidebarProps) {
  const router = useRouter()

  return (
    <div 
      className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out
        md:relative md:z-auto md:translate-x-0 md:transition-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        bg-muted/30 border-r border-border
        flex flex-col overflow-hidden h-full
      `}
    >
      {/* Sidebar Content */}
      <div className="flex flex-col h-full px-3 py-3">
        {/* Sidebar Header */}
        <div className="flex-shrink-0 pb-3">
          <div className="flex items-center justify-between min-h-[44px]">
            {/* Brand Section */}
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span className={`text-gray-900 dark:text-white ${componentTypography.sidebar.header}`}>
                OM Intel Chat
              </span>
            </div>
            
            {/* Close button for mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-10 w-10 p-0 md:hidden touch-manipulation"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="flex-shrink-0 pb-1">
          <Button 
            className={`w-full min-h-[44px] justify-start hover:bg-muted/10 active:bg-muted/20 focus-visible:ring-2 focus-visible:ring-accent transition-colors px-3 ${componentTypography.sidebar.navItem}`}
            variant="ghost"
            onClick={onNewChat}
          >
            <Plus className="w-5 h-5 mr-2" />
            New Chat
          </Button>
        </div>

        {/* Single Scrollable Content Area - Chat History takes priority */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatHistory
            sessions={chatSessions}
            currentSessionId={currentSessionId}
            isLoading={isLoadingHistory}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            isCollapsed={false}
          />
        </div>

        {/* User Profile */}
        <div className="flex-shrink-0 pt-3 border-t border-border">
          <div className="flex items-center gap-3 min-h-[44px]">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                {userData.name.split(' ').map((n: string) => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className={`text-gray-900 dark:text-white truncate ${componentTypography.sidebar.userName}`}>
                {userData.name}
              </p>
              <p className={componentTypography.sidebar.userPlan}>
                {userData.plan}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push('/settings')}
              title="Settings"
              className="h-8 w-8 p-0"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
