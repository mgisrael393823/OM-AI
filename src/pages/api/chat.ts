import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, apiError, AuthenticatedRequest } from '@/lib/auth-middleware'
import { openAIService } from '@/lib/services/openai'
import { CRE_FUNCTIONS } from '@/lib/services/openai/functions'
import {
  SUBSCRIPTION_LIMITS,
  UserContext,
  DocumentContext,
  CREChatMessage
} from '@/lib/services/openai/types'
import { openAICircuitBreaker } from '@/lib/utils/circuit-breaker'
import type { Database } from '@/types/database'

// Unified request type
interface UnifiedChatRequest {
  message?: string
  messages?: CREChatMessage[]
  sessionId?: string
  chat_session_id?: string // legacy field
  documentId?: string
  document_id?: string // legacy field
  documentContext?: {
    documentIds: string[]
    maxChunks?: number
    relevanceThreshold?: number
  }
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
    enableFunctions?: boolean
    stream?: boolean
  }
}

async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const startTime = Date.now()
  const {
    message,
    messages,
    sessionId: rawSessionId,
    chat_session_id,
    documentId,
    document_id,
    documentContext,
    options = {}
  } = req.body as UnifiedChatRequest

  const isSimple = typeof message === 'string'
  const sessionIdInput = rawSessionId || chat_session_id

  if (!isSimple && (!messages || !Array.isArray(messages))) {
    return apiError(res, 400, 'Invalid request format', 'INVALID_REQUEST')
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const userContext = await getUserContext(supabase, req.user.id)
    const rateLimits = SUBSCRIPTION_LIMITS[userContext.subscriptionTier]
    await enforceRateLimits(supabase, userContext, rateLimits)

    let sessionId = sessionIdInput
    if (!sessionId) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: req.user.id,
          title: isSimple ? message!.slice(0, 50) : 'New Chat',
          document_id: documentId || document_id || null
        })
        .select()
        .single()
      if (error || !data) {
        return apiError(res, 500, 'Failed to create chat session', 'SESSION_ERROR', error?.message)
      }
      sessionId = data.id
    } else {
      const { error } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', req.user.id)
        .single()
      if (error) {
        return apiError(res, 404, 'Chat session not found', 'SESSION_NOT_FOUND')
      }
    }

    // Build messages array and persist user messages
    let chatMessages: CREChatMessage[] = []
    if (isSimple) {
      await supabase.from('messages').insert({
        chat_session_id: sessionId,
        role: 'user',
        content: message!
      })
      const { data: history } = await supabase
        .from('messages')
        .select('role, content')
        .eq('chat_session_id', sessionId)
        .order('created_at', { ascending: true })
      chatMessages = (history || []) as CREChatMessage[]
    } else {
      chatMessages = messages!
      for (const m of messages!) {
        if (m.role === 'user' || m.role === 'assistant') {
          await supabase.from('messages').insert({
            chat_session_id: sessionId,
            role: m.role as 'user' | 'assistant',
            content: m.content
          })
        }
      }
    }

    let docContext: DocumentContext | null = null
    const docCtxRequest = documentContext || (documentId || document_id ? { documentIds: [documentId || document_id] } : undefined)
    if (docCtxRequest) {
      docContext = await getEnhancedDocumentContext(supabase, req.user.id, docCtxRequest)
    }

    const systemMessage = buildCRESystemMessage(docContext)
    const finalMessages = [systemMessage, ...chatMessages]

    const selectedModel = selectOptimalModel(options.model, userContext, docContext)
    const temperature = options.temperature ?? userContext.preferences?.temperature ?? 0.7
    const maxTokens = options.maxTokens ?? userContext.preferences?.maxTokens ?? getMaxTokensForTier(userContext.subscriptionTier)
    const enableFunctions = options.enableFunctions && rateLimits.features.functionCalling
    const stream = options.stream ?? true

    const chatRequest = {
      messages: finalMessages,
      model: selectedModel,
      temperature,
      maxTokens,
      functions: enableFunctions ? Object.values(CRE_FUNCTIONS) : undefined,
      userId: userContext.id,
      sessionId,
      documentContext: docContext ? docContext.totalTokens.toString() : undefined
    }

    console.info('Chat request', { format: isSimple ? 'simple' : 'complex', sessionId })

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Chat-Session-Id': sessionId
      })

      const result = await openAICircuitBreaker.execute(() =>
        openAIService.createStreamingCompletion(chatRequest, chunk => {
          res.write(chunk)
        })
      )

      await supabase.from('messages').insert({
        chat_session_id: sessionId,
        role: 'assistant',
        content: result.content
      })
      await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)

      res.end()
    } else {
      const result = await openAICircuitBreaker.execute(() => openAIService.createChatCompletion(chatRequest))

      await supabase.from('messages').insert({
        chat_session_id: sessionId,
        role: 'assistant',
        content: result.content
      })
      await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)

      res.status(200).json({
        id: result.id,
        content: result.content,
        model: result.model,
        usage: result.usage,
        metadata: { ...result.metadata, processingTime: Date.now() - startTime },
        functionCalls: result.functionCalls
      })
    }
  } catch (error) {
    console.error('Chat handler error:', error)
    return apiError(
      res,
      500,
      'Failed to process chat request',
      'CHAT_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

/** Helper functions from chat-v2 **/
async function getUserContext(supabase: any, userId: string): Promise<UserContext> {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  if (error || !user) {
    return {
      id: userId,
      email: 'unknown@example.com',
      subscriptionTier: 'starter',
      usageCount: 0,
      usageLimit: SUBSCRIPTION_LIMITS.starter.requestsPerDay
    }
  }
  return {
    id: user.id,
    email: user.email,
    subscriptionTier: (user as any).subscription_tier || 'starter',
    usageCount: user.usage_count || 0,
    usageLimit: user.usage_limit || SUBSCRIPTION_LIMITS[(user.subscription_tier || 'starter') as keyof typeof SUBSCRIPTION_LIMITS].requestsPerDay,
    preferences: {
      preferredModel: (user as any).preferred_model,
      temperature: (user as any).preferred_temperature,
      maxTokens: (user as any).preferred_max_tokens
    }
  }
}

async function enforceRateLimits(supabase: any, userContext: UserContext, limits: any): Promise<void> {
  if (userContext.usageCount >= userContext.usageLimit) {
    throw new Error(`Daily usage limit exceeded (${userContext.usageLimit} requests)`) 
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const { count } = await supabase
    .from('chat_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', userContext.id)
    .gte('created_at', hourAgo.toISOString())
  if (count && count >= limits.requestsPerHour) {
    throw new Error(`Hourly rate limit exceeded (${limits.requestsPerHour} requests/hour)`)
  }
  await supabase
    .from('users')
    .update({ usage_count: userContext.usageCount + 1 })
    .eq('id', userContext.id)
}

async function getEnhancedDocumentContext(
  supabase: any,
  userId: string,
  ctx: NonNullable<UnifiedChatRequest['documentContext']>
): Promise<DocumentContext> {
  const { documentIds, maxChunks = 5, relevanceThreshold = 0.1 } = ctx
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select(`content, page_number, chunk_type, documents!inner(name, id)`)
    .eq('user_id', userId)
    .in('document_id', documentIds)
    .limit(maxChunks * 2)
  if (error) {
    console.warn('Document context retrieval failed:', error)
    return { documentIds, relevantChunks: [], totalTokens: 0 }
  }
  const relevantChunks = (chunks || [])
    .map((chunk: any) => ({
      content: chunk.content,
      pageNumber: chunk.page_number,
      chunkType: chunk.chunk_type,
      documentName: chunk.documents?.name || 'Unknown Document',
      relevanceScore: calculateSemanticRelevance(chunk.content)
    }))
    .filter((c: any) => c.relevanceScore >= relevanceThreshold)
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxChunks)
  const totalTokens = relevantChunks.reduce((sum: number, c: any) => sum + Math.ceil(c.content.length / 4), 0)
  return { documentIds, relevantChunks, totalTokens, compressionRatio: chunks ? relevantChunks.length / chunks.length : 0 }
}

function calculateSemanticRelevance(content: string): number {
  const keywords = ['cap rate', 'noi', 'cash flow', 'lease', 'tenant', 'rent', 'vacancy', 'square feet', 'price per sf', 'operating expenses', 'gross income']
  const text = content.toLowerCase()
  const matches = keywords.filter(k => text.includes(k))
  return Math.min(1, matches.length / 3)
}

function selectOptimalModel(requested: string | undefined, userContext: UserContext, doc: DocumentContext | null): string {
  const allowed = SUBSCRIPTION_LIMITS[userContext.subscriptionTier].allowedModels
  const preferred = requested || userContext.preferences?.preferredModel
  if (preferred && allowed.includes(preferred)) return preferred
  const complex = doc && doc.totalTokens > 2000
  const advanced = complex || userContext.subscriptionTier !== 'starter'
  if (advanced && allowed.includes('gpt-4o')) return 'gpt-4o'
  return allowed[0] || 'gpt-4o-mini'
}

function buildCRESystemMessage(documentContext: DocumentContext | null): CREChatMessage {
  const base = `You are OM Intel, an advanced AI assistant specializing in commercial real estate analysis and document review. You are professional, insightful, and highly knowledgeable about:\n\n- Commercial real estate transactions and valuations\n- Property investment analysis and due diligence\n- Market trends and comparative analysis\n- Financial modeling and cash flow projections\n- Lease agreements and property management\n- Zoning, development, and regulatory matters\n- Risk assessment and mitigation strategies\n\nYour communication style is:\n- Professional yet approachable\n- Clear and concise\n- Data-driven with actionable insights\n- Focused on helping users make informed decisions\n\nWhen analyzing documents or answering questions:\n- Provide specific, detailed analysis\n- Highlight key risks and opportunities\n- Offer practical recommendations\n- Ask clarifying questions when needed\n- Reference relevant market standards and best practices\n- When document context is provided, reference specific details from the documents\n- Cite page numbers and document names when referencing uploaded content\n\nAlways maintain confidentiality and provide accurate, helpful information to support commercial real estate professionals in their decision-making process.`
  if (!documentContext) {
    return { role: 'system', content: base }
  }
  const ctx = `\n\nDOCUMENT CONTEXT:\nThe following information is from the user's uploaded documents (${documentContext.relevantChunks.length} relevant sections found):\n\n${documentContext.relevantChunks.map((c, i) => `[${i + 1}] From "${c.documentName}" (Page ${c.pageNumber}): ${c.content.substring(0, 800)}${c.content.length > 800 ? '...' : ''}`).join('\n')}\n\nPlease reference this document context in your response when relevant and cite specific page numbers and document names.`
  return { role: 'system', content: base + ctx }
}

function getMaxTokensForTier(tier: string): number {
  const limits: Record<string, number> = { starter: 1000, professional: 2000, enterprise: 4000 }
  return limits[tier] || 1000
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, chatHandler)
}
export { chatHandler }
