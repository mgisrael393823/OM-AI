export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          subscription_tier: 'starter' | 'professional' | 'enterprise'
          subscription_status: 'active' | 'cancelled' | 'past_due'
          subscription_id: string | null
          usage_count: number
          usage_limit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_tier?: 'starter' | 'professional' | 'enterprise'
          subscription_status?: 'active' | 'cancelled' | 'past_due'
          subscription_id?: string | null
          usage_count?: number
          usage_limit?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_tier?: 'starter' | 'professional' | 'enterprise'
          subscription_status?: 'active' | 'cancelled' | 'past_due'
          subscription_id?: string | null
          usage_count?: number
          usage_limit?: number
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          filename: string
          original_filename: string
          file_size: number
          file_type: string
          storage_path: string
          status: 'uploading' | 'processing' | 'completed' | 'error'
          extracted_text: string | null
          metadata: Record<string, any>
          processed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          filename: string
          original_filename: string
          file_size: number
          file_type: string
          storage_path: string
          status?: 'uploading' | 'processing' | 'completed' | 'error'
          extracted_text?: string | null
          metadata?: Record<string, any>
          processed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          filename?: string
          original_filename?: string
          file_size?: number
          file_type?: string
          storage_path?: string
          status?: 'uploading' | 'processing' | 'completed' | 'error'
          extracted_text?: string | null
          metadata?: Record<string, any>
          processed_at?: string | null
          created_at?: string
        }
      }
      chat_sessions: {
        Row: {
          id: string
          user_id: string
          title: string | null
          document_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          document_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          document_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          chat_session_id: string
          role: 'user' | 'assistant'
          content: string
          metadata: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          chat_session_id: string
          role: 'user' | 'assistant'
          content: string
          metadata?: Record<string, any>
          created_at?: string
        }
        Update: {
          id?: string
          chat_session_id?: string
          role?: 'user' | 'assistant'
          content?: string
          metadata?: Record<string, any>
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_subscription_id: string
          stripe_customer_id: string
          status: string
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_subscription_id: string
          stripe_customer_id: string
          status: string
          current_period_start: string
          current_period_end: string
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_subscription_id?: string
          stripe_customer_id?: string
          status?: string
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string
          action: 'document_upload' | 'chat_message' | 'document_analysis'
          document_id: string | null
          chat_session_id: string | null
          metadata: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: 'document_upload' | 'chat_message' | 'document_analysis'
          document_id?: string | null
          chat_session_id?: string | null
          metadata?: Record<string, any>
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: 'document_upload' | 'chat_message' | 'document_analysis'
          document_id?: string | null
          chat_session_id?: string | null
          metadata?: Record<string, any>
          created_at?: string
        }
      }
    }
  }
}