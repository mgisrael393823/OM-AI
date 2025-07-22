import React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Send, 
  Paperclip, 
  FileText, 
  User, 
  Bot,
  ChevronsRight,
  StopCircle
} from "lucide-react"

interface Document {
  id: string
  name: string
}

interface ChatInterfaceProps {
  selectedDocument: string | null
  documents: Document[]
}

export function ChatInterface({ selectedDocument, documents }: ChatInterfaceProps) {
  const selectedDoc = documents.find(d => d.id === selectedDocument)

  const messages = [
    {
      role: "assistant",
      content: "Hello! I'm ready to analyze your document. What would you like to know?",
    },
    {
      role: "user",
      content: "What is the property's Net Operating Income and Cap Rate?",
    },
    {
      role: "assistant",
      content: "The Net Operating Income (NOI) is $1,250,000 and the Capitalization Rate (Cap Rate) is 6.25%.",
    },
  ]

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Chat Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            AI Chat
          </h3>
          {selectedDoc ? (
            <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              <span>{selectedDoc.name}</span>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Select a document to start chatting
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm">
          <StopCircle className="h-4 w-4 mr-2" />
          Stop
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {messages.map((message, index) => (
            <div key={index} className={`flex items-start space-x-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-100 dark:bg-blue-900">
                    <Bot className="h-5 w-5 text-blue-600" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={`
                max-w-lg p-3 rounded-lg
                ${message.role === 'assistant' 
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200' 
                  : 'bg-blue-600 text-white'
                }
              `}>
                <p className="text-sm">{message.content}</p>
              </div>
              {message.role === 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t">
        {selectedDocument ? (
          <div className="relative">
            <Textarea
              placeholder="Ask about key metrics, investment highlights, or risks..."
              className="pr-20"
              rows={2}
            />
            <div className="absolute top-1/2 right-3 transform -translate-y-1/2 flex items-center space-x-2">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button size="sm" className="h-7">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Card className="text-center p-6 bg-slate-50 dark:bg-slate-800">
            <CardContent className="p-0">
              <ChevronsRight className="h-8 w-8 mx-auto text-slate-400 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Please select a document
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose a file from the list to enable the chat.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
