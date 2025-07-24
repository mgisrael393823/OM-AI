import React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  Building2, 
  FileText, 
  MessageSquare, 
  Settings, 
  LogOut,
  User,
  Crown
} from "lucide-react"
import { DocumentList } from "./DocumentList"

interface Document {
  id: string
  name: string
  uploadedAt: string
  status: "uploading" | "processing" | "completed" | "error"
  size: number
}

interface User {
  name: string
  email: string
  plan: string
}

interface AppSidebarProps {
  isOpen: boolean
  onClose: () => void
  user: User
  documents: Document[]
  selectedDocument: string | null
  onSelectDocument: (id: string | null) => void
}

export function AppSidebar({ 
  isOpen, 
  onClose, 
  user, 
  documents, 
  selectedDocument, 
  onSelectDocument 
}: AppSidebarProps) {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:fixed top-0 left-0 h-full w-80 bg-white dark:bg-slate-800 border-r z-50
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b">
            <Link href="/" className="flex items-center space-x-2 mb-6">
              <Building2 className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                OM Intel Chat
              </span>
            </Link>

            {/* User Profile */}
            <div className="flex items-center space-x-3">
              <Avatar>
                <AvatarFallback>
                  {user.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {user.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user.email}
                </p>
              </div>
              <Badge variant="secondary" className="flex items-center space-x-1">
                <Crown className="h-3 w-3" />
                <span className="text-xs">{user.plan}</span>
              </Badge>
            </div>
          </div>

          {/* Navigation */}
          <div className="p-4 border-b">
            <nav className="space-y-2">
              <Button variant="ghost" className="w-full justify-start">
                <MessageSquare className="h-4 w-4 mr-3" />
                Chat
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-3" />
                Documents
              </Button>
              <Link href="/settings">
                <Button variant="ghost" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-3" />
                  Settings
                </Button>
              </Link>
            </nav>
          </div>

          {/* Documents List */}
          <div className="flex-1 overflow-auto">
            <div className="p-4">
              <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
                Recent Documents
              </h3>
              <DocumentList 
                documents={documents}
                selectedDocument={selectedDocument}
                onSelectDocument={onSelectDocument}
                compact
              />
            </div>
          </div>

          {/* Usage Stats */}
          <div className="p-4 border-t">
            <Card className="bg-slate-50 dark:bg-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Documents</span>
                  <span className="font-medium">12 / 50</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">AI Queries</span>
                  <span className="font-medium">248 / ∞</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="p-4 border-t">
            <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
              <LogOut className="h-4 w-4 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}