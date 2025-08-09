import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, withRateLimit, AuthenticatedRequest } from '@/lib/auth-middleware'
import { ERROR_CODES, createApiError } from '@/lib/constants/errors'
import { openai, isOpenAIConfigured } from '@/lib/openai-client'
import { checkEnvironment, getConfig } from '@/lib/config'
import { logError } from '@/lib/error-logger'
import { getOmPrompt, CURRENT_OM_PROMPT_VERSION } from '@/lib/prompts/om-analyst'
import { getConversationalPrompt } from '@/lib/prompts/conversational'
import { getOmNaturalPrompt } from '@/lib/prompts/om-analyst-natural'
import { OM_ANALYST_DEVELOPMENT_PROMPT_V1, DEV_FIELDS } from '@/lib/prompts/om-analyst-development'
import { detectIntent, suggestResponseFormat, ChatIntent } from '@/lib/utils/intent-detection'
import { validateAndFilterOmResponse, createEmptyOMResponse } from '@/lib/validation/om-response'
import omSummarySchema from '@/lib/validation/om-schema.json'
import { getOpenAICostTracker } from '@/lib/openai-cost-tracker'
import { estimateTokens } from '@/lib/tokenizer'
import { pickModel } from '@/lib/services/openai'
import type { Database } from '@/types/database'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

type Chunk = {
  content: string
  page_number: number
  document_id: string  // REQUIRED for deduplication
  chunk_type?: string
  documents?: { original_filename?: string }
}

// Keep legacy type alias for compatibility
type ChunkWithDoc = Chunk

// Unified request type supporting both simple and complex formats
interface UnifiedChatRequest {
  // Simple format (chat-enhanced compatibility)
  message?: string
  sessionId?: string
  chat_session_id?: string // legacy field
  documentId?: string
  document_id?: string // legacy field
  
  // Complex format (chat-v2 compatibility)
  messages?: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  documentContext?: {
    documentIds: string[]
    maxChunks?: number
    relevanceThreshold?: number
  }
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
    stream?: boolean
  }
}

// Migration helper function to normalize different request formats
function normalizeRequest(body: any): UnifiedChatRequest {
  return {
    message: body.message,
    messages: body.messages,
    sessionId: body.sessionId || body.chat_session_id,
    documentId: body.documentId || body.document_id,
    documentContext: body.documentContext,
    options: body.options || {}
  }
}

// Helper: dedupe chunks by document_id + page_number
function dedupeByDocPage(list: Chunk[]): Chunk[] {
  const seen = new Set<string>();
  return (list ?? []).filter(c => {
    if (!c?.document_id || c.page_number == null) return false; // allow page 0
    const key = `${c.document_id}:${c.page_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(c.content?.trim());
  });
}

async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Request body logging removed for production
  
  if (req.method !== 'POST') {
    return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
  }

  // Validate environment at runtime (non-blocking)
  const validation = checkEnvironment()
  if (!validation.isValid) {
    console.warn("Environment validation warnings:", validation.errors)
  }

  // Check if OpenAI is properly configured
  if (!isOpenAIConfigured()) {
    return createApiError(res, ERROR_CODES.OPENAI_NOT_CONFIGURED,
      "OpenAI API key is not configured. Please contact support.")
  }

  // Normalize and validate request format
  const normalizedRequest = normalizeRequest(req.body)
  const hasMessage = 'message' in req.body
  const hasMessages = 'messages' in req.body
  const hasOptions = 'options' in req.body
  const hasDocumentContext = 'documentContext' in req.body
  
  // Hoisted context assembly variables
  let relevantChunks: Chunk[] = [];
  const MIN_HITS = 3;
  
  // Simple format: has message field (with optional sessionId, documentId, options for compatibility)
  // Complex format: has messages array field
  // If neither, default to simple format for better error messages
  const isSimple = hasMessage || !hasMessages

  // Validate request format
  if (isSimple) {
    if (!normalizedRequest.message) {
      return createApiError(res, ERROR_CODES.MISSING_MESSAGE)
    }
  } else {
    if (!normalizedRequest.messages || !Array.isArray(normalizedRequest.messages)) {
      return createApiError(res, ERROR_CODES.INVALID_MESSAGES)
    }
  }

  // Log deprecated endpoint usage
  const deprecatedEndpoint = req.headers['x-deprecated-endpoint'] as string
  if (deprecatedEndpoint) {
    console.warn(`Deprecated endpoint used: /api/${deprecatedEndpoint}`, {
      userId: req.user.id,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    })
  }

  const config = getConfig()
  
  // Regular client for user-specific operations
  const supabase = createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  // Apply rate limiting per user (simplified for now)
  try {
    await withRateLimit(req.user.id, 20, 2, async () => {
      // Rate limit: 20 requests per user, refill 2 tokens per minute
    })
  } catch (error) {
    return createApiError(res, ERROR_CODES.RATE_LIMIT_EXCEEDED)
  }

  try {
    // Handle session management
    let sessionId = normalizedRequest.sessionId
    if (isSimple && !sessionId) {
      // Auto-create session for simple format
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: req.user.id,
          title: normalizedRequest.message!.slice(0, 50) + (normalizedRequest.message!.length > 50 ? '...' : ''),
          document_id: normalizedRequest.documentId || null
        })
        .select()
        .single()

      if (sessionError) {
        return createApiError(res, ERROR_CODES.SESSION_ERROR, sessionError.message)
      }

      sessionId = newSession.id
    } else if (sessionId) {
      // Verify session belongs to user
      const { error: sessionVerifyError } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', req.user.id)
        .single()

      if (sessionVerifyError) {
        return createApiError(res, ERROR_CODES.SESSION_NOT_FOUND)
      }
    }

    // Handle document context
    let contextualInformation = ""
    const documentIds = normalizedRequest.documentContext?.documentIds || 
      (normalizedRequest.documentId ? [normalizedRequest.documentId] : [])
    
    // Initialize deal type (will be set when we have document context)
    let dealType: 'development' | 'acquisition' = 'acquisition';
    
    if (documentIds.length > 0) {
      try {
        const userQuery = isSimple ? normalizedRequest.message : 
          normalizedRequest.messages?.[normalizedRequest.messages.length - 1]?.content || ""
        
        // Get document chunks - prioritize financial content with comprehensive keywords
        const financialKeywords = [
          // Core financial metrics
          'irr', 'leveraged irr', 'levered irr', 'equity multiple', 'cash on cash', 'noi', 'cap rate', 'capitalization rate',
          'total investment', 'equity investment', 'debt', 'loan', 'financing', 'ltv', 'dscr',
          // Returns and performance
          'return', 'yield', 'distribution', 'cash flow', 'net cash flow', 'operating cash flow',
          'revenue', 'income', 'rental income', 'gross rental income', 'effective gross income',
          // Property financials  
          'rent', 'rental rate', 'lease', 'occupancy', 'vacancy', 'expense', 'operating expense',
          'noi', 'net operating income', 'ebitda', 'debt service', 'mortgage payment',
          // Property details
          'square feet', 'sf', 'psf', 'unit', 'apartment', 'bedroom', 'bath', 'parking',
          'acquisition', 'purchase', 'sale', 'price', 'valuation', 'appraisal',
          // Deal structure
          'hold period', 'exit', 'refinance', 'disposition', 'summary', 'executive summary',
          'key metrics', 'financial highlights', 'investment highlights', 'deal points'
        ]
        
        const { data: rawChunks, error: allChunksError } = await supabaseAdmin
          .from('document_chunks')
          .select(`
            content,
            page_number,
            chunk_type,
            document_id,
            documents:documents(original_filename)
          `)
          .in('document_id', documentIds)
          .order('page_number', { ascending: true })
          .limit(100)
        
        if (allChunksError) {
          console.error('Error retrieving document chunks:', allChunksError)
        }

        // Runtime guard to ensure documents is properly typed
        const allChunks: ChunkWithDoc[] = (rawChunks ?? [])
          .filter((r): r is ChunkWithDoc => 
            !!r && 
            typeof r.content === 'string' &&
            typeof r.page_number === 'number' &&
            typeof r.document_id === 'string' &&
            typeof r.chunk_type === 'string' &&
            !!(r as any).documents?.original_filename
          )
          .map(r => ({
            content: String(r.content),
            page_number: Number(r.page_number),
            document_id: String(r.document_id),
            chunk_type: String(r.chunk_type),
            documents: { original_filename: String((r as any).documents.original_filename) }
          }))
        
        // Now try with text search if we have chunks and a query
        relevantChunks = allChunks || []
        let searchChunks = null
        
        if (allChunks && allChunks.length > 0 && userQuery) {
          // First try RPC call with plainto_tsquery for safe text search
          // Use admin client to bypass RLS
          const { data, error: searchError } = await supabaseAdmin
            .rpc('search_document_chunks', {
              p_document_ids: documentIds,
              p_query: userQuery,
              p_limit: 20
            })
          
          // Convert search results to proper type with runtime guard
          searchChunks = (data ?? [])
            .filter((r): r is ChunkWithDoc => 
              !!r && 
              typeof (r as any).content === 'string' &&
              typeof (r as any).page_number === 'number' &&
              typeof (r as any).document_id === 'string' &&
              typeof (r as any).chunk_type === 'string' &&
              !!(r as any).documents?.original_filename
            )
            .map(r => ({
              content: String((r as any).content),
              page_number: Number((r as any).page_number),
              document_id: String((r as any).document_id),
              chunk_type: String((r as any).chunk_type),
              documents: { original_filename: String((r as any).documents.original_filename) }
            }))
          
          if (searchError) {
            console.error('Error in document text search:', searchError)
            console.log('Falling back to keyword-based financial chunk filtering')
            
            // Prioritize chunks with financial keywords for key deal points queries
            if (userQuery.toLowerCase().includes('key') || userQuery.toLowerCase().includes('deal point') || 
                userQuery.toLowerCase().includes('metric') || userQuery.toLowerCase().includes('financial')) {
              
              // Score chunks by financial keyword matches
              const scoredChunks = allChunks.map(chunk => {
                const content = chunk.content.toLowerCase()
                let score = 0
                
                // Higher weight for executive summary/key sections
                if (content.includes('executive summary') || content.includes('investment highlights') || 
                    content.includes('key metrics') || content.includes('financial highlights')) {
                  score += 10
                }
                
                // Count financial keyword matches
                financialKeywords.forEach(keyword => {
                  if (content.includes(keyword.toLowerCase())) {
                    score += 1
                  }
                })
                
                return { chunk, score }
              }).filter(item => item.score > 0)
              
              // Sort by score and take top chunks
              const topScoredChunks = scoredChunks
                .sort((a, b) => b.score - a.score)
                .slice(0, 15)
                .map(item => item.chunk)
              
              if (topScoredChunks.length > 0) {
                relevantChunks = topScoredChunks
                console.log(`Prioritized ${topScoredChunks.length} financial content chunks`)
              }
            } else {
              // For non-financial queries, try document-specific filtering
              const specificChunks = allChunks.filter(chunk => {
                const filename = (chunk as any).documents?.original_filename?.toLowerCase() || ''
                return filename.includes('milwaukee') || filename.includes('tampa') || filename.includes('om')
              })
              
              if (specificChunks.length > 0) {
                relevantChunks = specificChunks
                console.log(`Filtered to ${specificChunks.length} document-specific chunks`)
              }
            }
          }
          
          // Use search results if available, otherwise fall back to filtered chunks
          if (searchChunks && searchChunks.length > 0) {
            relevantChunks = searchChunks
          }
        }
        
        // Primer fallback when LOW HITS (not just zero)
        if (!relevantChunks || relevantChunks.length < MIN_HITS) {
          console.log('[OM-AI] Low hits, attempting primer injection', {
            currentHits: relevantChunks?.length || 0,
            threshold: MIN_HITS
          })
          
          // Get primer pages with high-signal content
          const { data: primerPages } = await supabaseAdmin
            .from('document_chunks')
            .select('content,page_number,document_id')
            .in('document_id', documentIds)
            .or("content.ilike.%executive%,content.ilike.%summary%,content.ilike.%overview%,content.ilike.%assumptions%,content.ilike.%unit%,content.ilike.%mix%,content.ilike.%sources%,content.ilike.%uses%")
            .order('page_number', { ascending: true })
            .limit(12)

          const primerChunks: Chunk[] = (primerPages ?? [])
            .filter((r: any) => r?.content && r?.document_id)
            .map((r: any) => ({
              content: String(r.content),
              page_number: Number(r.page_number),
              document_id: String(r.document_id)
            }))
          
          // If no primer chunks, get first pages as fallback
          let firstPageChunks: Chunk[] = []
          if (primerChunks.length === 0) {
            const { data: firstPages } = await supabaseAdmin
              .from('document_chunks')
              .select('content,page_number,document_id')
              .in('document_id', documentIds)
              .order('page_number', { ascending: true })
              .limit(6)

            firstPageChunks = (firstPages ?? [])
              .filter((r: any) => r?.content && r?.document_id)
              .map((r: any) => ({
                content: String(r.content),
                page_number: Number(r.page_number),
                document_id: String(r.document_id)
              }))
          }
          
          // Merge and deduplicate
          relevantChunks = dedupeByDocPage([
            ...(relevantChunks ?? []),
            ...primerChunks,
            ...firstPageChunks
          ])
          
          console.warn('[OM-AI] primer injected', {
            docCount: documentIds.length,
            pages: relevantChunks.map(c => ({ 
              document_id: c.document_id, 
              page_number: c.page_number 
            }))
          })
        }
        
        // Detect deal type from primer text
        const primerText = relevantChunks.slice(0, 8).map(c => c.content).join('\n').slice(0, 8000);
        const isDev = /total (project|development) cost|TDC|sources\s*(?:&|and)\s*uses|use[s]?\s*of\s*funds|stabiliz(e|ed)\s*noi|exit\s*cap|yield on cost|construction (start|completion)|delivery|lease[\s-]*up/i.test(primerText);
        dealType = isDev ? 'development' : 'acquisition';
        console.log('[OM-AI] dealType:', dealType);

        if (relevantChunks && relevantChunks.length > 0) {
          // Enhanced financial content prioritization for key deal points queries
          if (!searchChunks && userQuery && (userQuery.toLowerCase().includes('metric') || 
              userQuery.toLowerCase().includes('financial') || userQuery.toLowerCase().includes('key') ||
              userQuery.toLowerCase().includes('deal point') || userQuery.toLowerCase().includes('highlight'))) {
            
            // Score and rank chunks by financial relevance
            const scoredFinancialChunks = relevantChunks.map(chunk => {
              const content = chunk.content.toLowerCase()
              let score = 0
              
              // Executive summary sections get highest priority
              if (content.includes('executive summary') || content.includes('investment summary') ||
                  content.includes('key metrics') || content.includes('financial highlights')) {
                score += 20
              }
              
              // IRR and equity multiple are critical metrics
              if (content.includes('irr') || content.includes('equity multiple')) {
                score += 15
              }
              
              // Other key financial metrics
              if (content.includes('noi') || content.includes('cap rate') || 
                  content.includes('cash flow') || content.includes('total investment')) {
                score += 10
              }
              
              // General financial keywords
              const keywordMatches = financialKeywords.filter(keyword => 
                content.includes(keyword.toLowerCase())
              ).length
              score += keywordMatches
              
              return { chunk, score }
            })
            
            // Sort by financial relevance and prioritize top chunks
            const topFinancialChunks = scoredFinancialChunks
              .sort((a, b) => b.score - a.score)
              .slice(0, 12)
              .map(item => item.chunk)
            
            // Add remaining chunks to fill context
            const remainingChunks = relevantChunks
              .filter(chunk => !topFinancialChunks.includes(chunk))
              .slice(0, 8)
            
            relevantChunks = [...topFinancialChunks, ...remainingChunks]
            console.log(`Prioritized financial chunks with scores:`, scoredFinancialChunks
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map(item => ({ score: item.score, preview: item.chunk.content.substring(0, 50) }))
            )
          }
          
          // Use searchChunks if available (from RPC search), otherwise use relevantChunks
          const chunksToUse = (searchChunks && searchChunks.length > 0) ? searchChunks : relevantChunks
          
          // Enhanced logging with chunk content preview
          console.log("Chunks analysis:")
          console.log(`Total chunks available: ${allChunks?.length || 0}`)
          console.log(`Search results: ${searchChunks?.length || 0}`)
          console.log(`Using ${chunksToUse.length} chunks:`, chunksToUse.map((c: any, idx: number) => {
            const preview = c.content.substring(0, 100).replace(/\n/g, ' ') + '...'
            return `${idx + 1}. Page ${c.page_number} (${(c as any).documents?.original_filename || 'Unknown'}): "${preview}"`
          }))
          
          if (!searchChunks || searchChunks.length === 0) {
            console.warn("Fallback to filtered chunks - RPC search returned no results")
          }
          
          contextualInformation = `

DOCUMENT CONTEXT:
The following information is from the user's uploaded documents:

${chunksToUse
  .map((chunk: any, index: number) => {
    const docName = (chunk as any).documents?.original_filename ?? 'Unknown';
    return `[${index + 1}] From "${docName}" (Page ${chunk.page_number}):
${chunk.content.substring(0, 1500)}${chunk.content.length > 1500 ? '...' : ''}`;
  })
  .join('\n')}

Please reference this document context in your response when relevant.`
        } else {
          // No chunks found after all attempts - return error if documents are attached
          if (Array.isArray(documentIds) && documentIds.length > 0) {
            console.error('[OM-AI] No context available despite document IDs', {
              documentIds,
              attemptedHeuristics: ['vector_search', 'keyword_filter', 'primer_injection', 'first_pages']
            })
            
            return res.status(400).json({
              error: 'No document context available. Re-ingest with OCR or try again.',
              code: 'NO_CONTEXT'
            })
          }
        }
      } catch (error) {
        console.error('Error retrieving document context:', error)
      }
    }

    // Build messages for OpenAI
    let messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }> = []
    
    if (isSimple) {
      // For simple format, save user message and get conversation history
      if (sessionId) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'user',
          content: normalizedRequest.message!
        })

        // Get conversation history
        const { data: history } = await supabase
          .from('messages')
          .select('role, content')
          .eq('chat_session_id', sessionId)
          .order('created_at', { ascending: true })

        messages = (history || []) as Array<{ role: 'user' | 'assistant' | 'system', content: string }>
      } else {
        // No session, just use the current message
        messages = [{ role: 'user', content: normalizedRequest.message! }]
      }
    } else {
      // For complex format, use provided messages
      messages = normalizedRequest.messages!
    }

    // Detect user intent to determine appropriate response format
    const userMessage = isSimple ? normalizedRequest.message! : 
      messages[messages.length - 1]?.content || "";
    
    const hasDocContext = !!contextualInformation || documentIds.length > 0;
    const intentAnalysis = detectIntent(userMessage, hasDocContext, messages);
    const responseFormat = suggestResponseFormat(intentAnalysis);
    
    // Select appropriate system prompt based on intent
    let systemPrompt: string;
    let useJsonSchema = false;
    
    if (intentAnalysis.intent === ChatIntent.JSON_REQUEST) {
      // User explicitly wants JSON
      systemPrompt = getOmPrompt(CURRENT_OM_PROMPT_VERSION);
      useJsonSchema = true;
    } else if (documentIds.length > 0) {
      // Force document analysis prompt when documents are attached
      const lowerQuery = userMessage.toLowerCase();
      if (lowerQuery.includes('key') || lowerQuery.includes('deal') || lowerQuery.includes('point') || 
          lowerQuery.includes('metric') || lowerQuery.includes('financial') || lowerQuery.includes('summary')) {
        // User asking for key metrics/deal points - use deal-type-specific prompt
        if (dealType === 'development') {
          systemPrompt = OM_ANALYST_DEVELOPMENT_PROMPT_V1;
          console.log('📊 Using development metrics extraction prompt');
        } else {
          systemPrompt = getOmNaturalPrompt('metrics_extraction');
          console.log('📊 Using acquisition metrics extraction prompt');
        }
      } else {
        systemPrompt = getOmNaturalPrompt('full');
        console.log('📄 Using full document analysis prompt');
      }
    } else if (intentAnalysis.intent === ChatIntent.DOCUMENT_ANALYSIS && hasDocContext) {
      // Document analysis with natural language output (fallback)
      const lowerQuery = userMessage.toLowerCase();
      if (lowerQuery.includes('key') && (lowerQuery.includes('data') || lowerQuery.includes('metric') || lowerQuery.includes('point'))) {
        systemPrompt = getOmNaturalPrompt('metrics_extraction');
      } else {
        systemPrompt = getOmNaturalPrompt(intentAnalysis.analysisType || 'full');
      }
    } else {
      // General conversation
      systemPrompt = getConversationalPrompt(hasDocContext);
    }
    
    // Log context pages before sending to model
    if (relevantChunks?.length) {
      const preview = relevantChunks.slice(0, 5).map(c => ({
        document_id: c.document_id,
        page_number: c.page_number,
        preview: (c.content ?? '').slice(0, 80).replace(/\n/g, ' ')
      }))
      console.log('[OM-AI] context preview', { total: relevantChunks.length, preview })
    }
    
    const systemMessage = {
      role: "system" as const,
      content: contextualInformation ? 
        `${systemPrompt}\n\nDEAL TYPE: ${dealType}\n\nDOCUMENT CONTEXT:\n${contextualInformation}` : 
        systemPrompt
    }

    // SECURITY: Check OpenAI cost limits before making the call
    const costTracker = getOpenAICostTracker()
    const limitCheck = await costTracker.checkLimitsBeforeCall(req.user.id)
    
    if (!limitCheck.canProceed) {
      return createApiError(res, ERROR_CODES.RATE_LIMIT_EXCEEDED, limitCheck.reason)
    }

    // Estimate input tokens for model selection
    const inputText = [systemMessage, ...messages].map(m => m.content).join(' ')
    const estInputTokens = await estimateTokens(inputText)
    
    // Determine if this requires table extraction (detect tables in context)
    const requiresTableExtraction = !!(contextualInformation && 
      (contextualInformation.includes('|') || contextualInformation.match(/\d+\s*\|\s*\d+/)))
    
    // Allow per-request model override for dev/admin users
    const debugModel = (req.headers['x-model-name'] || req.query.model) as string | undefined
    const allowOverride = process.env.NODE_ENV !== 'production' || req.user.role === 'admin'
    
    // Select model based on request characteristics or override
    const modelName = allowOverride && debugModel ? debugModel : pickModel({
      mode: intentAnalysis.intent === ChatIntent.DOCUMENT_ANALYSIS ? 'analysis' : 'chat',
      estInputTokens,
      requiresTableExtraction
    })

    // Use SSE format for deprecated endpoints or when explicitly requested
    const useSSEFormat = !!deprecatedEndpoint
    const shouldStream = normalizedRequest.options?.stream !== false

    if (shouldStream) {
      // Set up streaming headers
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
      
      if (useSSEFormat) {
        headers['Content-Type'] = 'text/event-stream'
        headers['X-Accel-Buffering'] = 'no'
      } else {
        headers['Content-Type'] = 'text/plain; charset=utf-8'
      }
      
      if (sessionId) {
        headers['X-Chat-Session-Id'] = sessionId
      }
      
      res.writeHead(200, headers)

      // Create streaming response with optional structured outputs
      let response;
      
      if (useJsonSchema) {
        response = await openai.chat.completions.create({
          model: modelName,
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: true,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'om_analysis',
              schema: omSummarySchema,
              strict: true
            }
          }
        });
      } else {
        response = await openai.chat.completions.create({
          model: modelName,
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: true
        });
      }

      let assistantResponse = ""
      let buffer = ''
      let lastFlush = Date.now()
      const FLUSH_INTERVAL = 50
      const MIN_CHUNK_SIZE = 5
      
      const flushBuffer = () => {
        if (buffer) {
          if (useSSEFormat) {
            res.write(`data: ${JSON.stringify({ content: buffer })}\n\n`)
          } else {
            res.write(buffer)
          }
          assistantResponse += buffer
          buffer = ''
          lastFlush = Date.now()
        }
      }

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || ""
        if (content) {
          buffer += content
          
          const shouldFlush = buffer.length >= MIN_CHUNK_SIZE || 
                             (Date.now() - lastFlush) >= FLUSH_INTERVAL
          
          if (shouldFlush) {
            flushBuffer()
          }
        }
      }
      
      flushBuffer()

      if (useSSEFormat) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
      }

      // Validate structured response only if JSON was requested
      let validatedResponse = assistantResponse;
      if (useJsonSchema && assistantResponse) {
        try {
          const parsedResponse = JSON.parse(assistantResponse);
          const validation = validateAndFilterOmResponse(parsedResponse);
          
          if (!validation.success) {
            console.warn('OM Response validation failed (streaming):', validation.errors);
            // For streaming, we already sent the response, so just log the issue
          }
        } catch (parseError) {
          console.warn('Failed to parse streaming JSON response:', parseError);
        }
      }

      // Save assistant response if we have a session
      if (sessionId && validatedResponse) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: validatedResponse,
          prompt_version: CURRENT_OM_PROMPT_VERSION
        })

        await supabase.from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }

      res.end()
      
      // Track usage after streaming completes
      // Note: Streaming responses don't include usage data, so we estimate
      const inputText = [systemMessage, ...messages].map(m => m.content).join(' ')
      const estimatedInputTokens = Math.ceil(inputText.length / 4) // Rough estimation: 4 chars per token
      const estimatedOutputTokens = Math.ceil(assistantResponse.length / 4)
      
      await costTracker.trackUsage(req.user.id, {
        model: modelName,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens
      })
    } else {
      // Non-streaming response with optional structured outputs
      let response;
      
      if (useJsonSchema) {
        response = await openai.chat.completions.create({
          model: modelName,
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'om_analysis',
              schema: omSummarySchema,
              strict: true
            }
          }
        });
      } else {
        response = await openai.chat.completions.create({
          model: modelName,
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: false
        });
      }

      const assistantContent = response.choices[0]?.message?.content || ""

      // Validate and filter structured response only if JSON was requested
      let validatedContent = assistantContent;
      let validationWarnings: string[] = [];
      
      if (useJsonSchema && assistantContent) {
        try {
          const parsedResponse = JSON.parse(assistantContent);
          const validation = validateAndFilterOmResponse(parsedResponse);
          
          if (validation.success && validation.data) {
            validatedContent = JSON.stringify(validation.data);
          } else {
            console.warn('OM Response validation failed (non-streaming):', validation.errors);
            validationWarnings = validation.errors || [];
            // Fallback to empty response if validation fails
            const emptyResponse = createEmptyOMResponse();
            validatedContent = JSON.stringify(emptyResponse);
          }
        } catch (parseError) {
          console.error('Failed to parse non-streaming JSON response:', parseError);
          // Fallback to empty response
          const emptyResponse = createEmptyOMResponse();
          validatedContent = JSON.stringify(emptyResponse);
          validationWarnings = ['Failed to parse JSON response'];
        }
      }

      // Save messages if we have a session
      if (sessionId) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: validatedContent,
          prompt_version: CURRENT_OM_PROMPT_VERSION,
          token_usage: response.usage ? JSON.stringify(response.usage) : null
        })

        await supabase.from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }

      // Track usage for non-streaming response (has actual token counts)
      if (response.usage) {
        await costTracker.trackUsage(req.user.id, {
          model: modelName,
          inputTokens: response.usage.prompt_tokens || 0,
          outputTokens: response.usage.completion_tokens || 0
        })
      }

      res.status(200).json({
        id: response.id,
        content: validatedContent,
        model: response.model,
        usage: response.usage,
        sessionId,
        ...(validationWarnings.length > 0 && { validationWarnings })
      })
    }

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error ?? 'unknown')
    const code =
      msg.includes('NO_CONTEXT') ? 'NO_CONTEXT' :
      /openai|timeout|rate limit|quota/i.test(msg) ? 'OPENAI_ERROR' :
      'CONTEXT_ASSEMBLY_ERROR'
    
    console.error('[OM-AI]/api/chat error:', { code, msg })
    
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Request failed',
        code,
        timestamp: new Date().toISOString(),
        details: process.env.NODE_ENV === 'development' ? msg : undefined
      })
    } else {
      if (deprecatedEndpoint === 'chat-enhanced' || deprecatedEndpoint === 'chat') {
        res.write(`data: ${JSON.stringify({ 
          error: msg,
          code 
        })}\n\n`)
      }
      res.end()
    }
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, chatHandler)
}

export { chatHandler }
