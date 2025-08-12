// Re-export the ChatSession type from the hook to maintain consistency
export type { ChatSession } from '@/hooks/useChatSessions'

export interface UserData {
  name: string
  email: string
  plan: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string | Date
}
