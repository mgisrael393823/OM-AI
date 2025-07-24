/**
 * Modernized Chat API Endpoint
 * 
 * Production-ready chat endpoint using the new OpenAI service layer with:
 * - Enhanced error handling and retry logic
 * - Subscription-based rate limiting
 * - Function calling for CRE analysis
 * - Performance monitoring and caching
 * - Document context optimization
 */

import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from '@supabase/supabase-js';
import { withAuth, apiError, AuthenticatedRequest } from "@/lib/auth-middleware";
import { openAIService } from "@/lib/services/openai";
import { CRE_FUNCTIONS } from "@/lib/services/openai/functions";
import { SUBSCRIPTION_LIMITS } from "@/lib/services/openai/types";
import { enhancedPDFParser } from "@/lib/services/pdf/enhanced-parser";
import { openAICircuitBreaker } from "@/lib/utils/circuit-breaker";
import type { UserContext, DocumentContext, CREChatMessage } from "@/lib/services/openai/types";

// Enhanced request interface
interface ChatRequest {
  messages: CREChatMessage[];
  documentContext?: {
    documentIds: string[];
    maxChunks?: number;
    relevanceThreshold?: number;
  };
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    enableFunctions?: boolean;
    stream?: boolean;
  };
  sessionId?: string;
}

async function modernChatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");
  }

  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Parse and validate request
    const {
      messages,
      documentContext,
      options = {},
      sessionId
    }: ChatRequest = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return apiError(res, 400, "Messages array is required", "INVALID_MESSAGES");
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user context for rate limiting and personalization
    const userContext = await getUserContext(supabase, req.user.id);
    const rateLimits = SUBSCRIPTION_LIMITS[userContext.subscriptionTier];

    // Check subscription-based rate limits
    await enforceRateLimits(supabase, userContext, rateLimits);

    // Retrieve and optimize document context
    const enhancedContext = documentContext 
      ? await getEnhancedDocumentContext(supabase, userContext.id, documentContext)
      : null;

    // Determine optimal model based on subscription and request
    const selectedModel = selectOptimalModel(options.model, userContext, enhancedContext);

    // Build enhanced system message with CRE expertise
    const systemMessage = buildCRESystemMessage(enhancedContext);

    // Prepare function definitions if enabled and allowed
    const functions = (options.enableFunctions && rateLimits.features.functionCalling) 
      ? Object.values(CRE_FUNCTIONS)
      : undefined;

    // Prepare chat completion request
    const chatRequest = {
      messages: [systemMessage, ...messages],
      model: selectedModel,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || getMaxTokensForTier(userContext.subscriptionTier),
      functions,
      userId: userContext.id,
      sessionId,
      documentContext: enhancedContext?.totalTokens.toString()
    };

    console.info(`Chat request initiated`, {
      requestId,
      userId: userContext.id,
      model: selectedModel,
      messageCount: messages.length,
      hasContext: !!enhancedContext,
      hasFunctions: !!functions,
      tier: userContext.subscriptionTier
    });

    // Handle streaming vs non-streaming responses
    if (options.stream) {
      return await handleStreamingResponse(res, chatRequest, userContext, requestId, startTime);
    } else {
      return await handleStandardResponse(res, chatRequest, userContext, requestId, startTime);
    }

  } catch (error) {
    console.error(`Chat request failed`, {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user.id,
      processingTime: Date.now() - startTime
    });

    return apiError(
      res,
      500,
      "Failed to process chat request",
      "CHAT_PROCESSING_ERROR",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Get user context with subscription and usage information
 */
async function getUserContext(supabase: any, userId: string): Promise<UserContext> {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    // Return default context for new users
    return {
      id: userId,
      email: 'unknown@example.com',
      subscriptionTier: 'starter',
      usageCount: 0,
      usageLimit: SUBSCRIPTION_LIMITS.starter.requestsPerDay
    };
  }

  return {
    id: user.id,
    email: user.email,
    subscriptionTier: user.subscription_tier || 'starter',
    usageCount: user.usage_count || 0,
    usageLimit: user.usage_limit || SUBSCRIPTION_LIMITS[(user.subscription_tier || 'starter') as keyof typeof SUBSCRIPTION_LIMITS].requestsPerDay,
    preferences: {
      preferredModel: user.preferred_model,
      temperature: user.preferred_temperature,
      maxTokens: user.preferred_max_tokens
    }
  };
}

/**
 * Enforce subscription-based rate limits
 */
async function enforceRateLimits(supabase: any, userContext: UserContext, limits: any): Promise<void> {
  // Check daily usage limit
  if (userContext.usageCount >= userContext.usageLimit) {
    throw new Error(`Daily usage limit exceeded (${userContext.usageLimit} requests)`);
  }

  // Check hourly rate limit (simplified - in production use Redis)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { count } = await supabase
    .from('chat_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', userContext.id)
    .gte('created_at', hourAgo.toISOString());

  if (count && count >= limits.requestsPerHour) {
    throw new Error(`Hourly rate limit exceeded (${limits.requestsPerHour} requests/hour)`);
  }

  // Increment usage count
  await supabase
    .from('users')
    .update({ usage_count: userContext.usageCount + 1 })
    .eq('id', userContext.id);
}

/**
 * Retrieve and enhance document context with semantic relevance
 */
async function getEnhancedDocumentContext(
  supabase: any,
  userId: string,
  contextRequest: NonNullable<ChatRequest['documentContext']>
): Promise<DocumentContext> {
  const { documentIds, maxChunks = 5, relevanceThreshold = 0.1 } = contextRequest;

  // Get relevant document chunks with semantic search
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select(`
      content,
      page_number,
      chunk_type,
      documents!inner(name, id)
    `)
    .eq('user_id', userId)
    .in('document_id', documentIds)
    .limit(maxChunks * 2); // Get more chunks for filtering

  if (error) {
    console.warn('Document context retrieval failed:', error);
    return {
      documentIds,
      relevantChunks: [],
      totalTokens: 0
    };
  }

  // Process and rank chunks by relevance
  const relevantChunks = (chunks || [])
    .map((chunk: any) => ({
      content: chunk.content,
      pageNumber: chunk.page_number,
      chunkType: chunk.chunk_type,
      documentName: chunk.documents?.name || 'Unknown Document',
      relevanceScore: calculateSemanticRelevance(chunk.content) // Simplified scoring
    }))
    .filter((chunk: any) => chunk.relevanceScore >= relevanceThreshold)
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxChunks);

  // Calculate total tokens (approximate)
  const totalTokens = relevantChunks.reduce((sum: any, chunk: any) => 
    sum + Math.ceil(chunk.content.length / 4), 0
  );

  return {
    documentIds,
    relevantChunks,
    totalTokens,
    compressionRatio: chunks ? relevantChunks.length / chunks.length : 0
  };
}

/**
 * Simple semantic relevance scoring (placeholder for more sophisticated implementation)
 */
function calculateSemanticRelevance(content: string): number {
  // In production, this would use embeddings or more sophisticated NLP
  const creKeywords = [
    'cap rate', 'noi', 'cash flow', 'lease', 'tenant', 'rent', 'vacancy',
    'square feet', 'price per sf', 'operating expenses', 'gross income'
  ];

  const contentLower = content.toLowerCase();
  const matches = creKeywords.filter(keyword => contentLower.includes(keyword));
  
  return Math.min(1.0, matches.length / 3); // Normalize to 0-1 scale
}

/**
 * Select optimal model based on user tier and context complexity
 */
function selectOptimalModel(
  requestedModel: string | undefined,
  userContext: UserContext,
  documentContext: DocumentContext | null
): string {
  const allowedModels = SUBSCRIPTION_LIMITS[userContext.subscriptionTier].allowedModels;
  
  // Use user preference if valid
  const preferredModel = requestedModel || userContext.preferences?.preferredModel;
  if (preferredModel && allowedModels.includes(preferredModel)) {
    return preferredModel;
  }

  // Auto-select based on context complexity
  const hasComplexContext = documentContext && documentContext.totalTokens > 2000;
  const needsAdvancedModel = hasComplexContext || userContext.subscriptionTier !== 'starter';

  if (needsAdvancedModel && allowedModels.includes('gpt-4o')) {
    return 'gpt-4o';
  }

  return allowedModels[0] || 'gpt-4o-mini';
}

/**
 * Build enhanced system message with CRE expertise
 */
function buildCRESystemMessage(documentContext: DocumentContext | null): CREChatMessage {
  const basePrompt = `You are OM Intel, an advanced AI assistant specializing in commercial real estate analysis and document review. You are professional, insightful, and highly knowledgeable about:

- Commercial real estate transactions and valuations
- Property investment analysis and due diligence
- Market trends and comparative analysis
- Financial modeling and cash flow projections
- Lease agreements and property management
- Zoning, development, and regulatory matters
- Risk assessment and mitigation strategies

Your communication style is:
- Professional yet approachable
- Clear and concise
- Data-driven with actionable insights
- Focused on helping users make informed decisions

When analyzing documents or answering questions:
- Provide specific, detailed analysis
- Highlight key risks and opportunities
- Offer practical recommendations
- Ask clarifying questions when needed
- Reference relevant market standards and best practices
- When document context is provided, reference specific details from the documents
- Cite page numbers and document names when referencing uploaded content

Always maintain confidentiality and provide accurate, helpful information to support commercial real estate professionals in their decision-making process.`;

  const contextPrompt = documentContext ? `

DOCUMENT CONTEXT:
The following information is from the user's uploaded documents (${documentContext.relevantChunks.length} relevant sections found):

${documentContext.relevantChunks
  .map((chunk, index) => 
    `[${index + 1}] From "${chunk.documentName}" (Page ${chunk.pageNumber}):
${chunk.content.substring(0, 800)}${chunk.content.length > 800 ? '...' : ''}
`
  )
  .join('\n')}

Please reference this document context in your response when relevant and cite specific page numbers and document names.` : '';

  return {
    role: "system",
    content: basePrompt + contextPrompt
  };
}

/**
 * Get maximum tokens allowed for subscription tier
 */
function getMaxTokensForTier(tier: string): number {
  const limits = {
    starter: 1000,
    professional: 2000,
    enterprise: 4000
  };
  return limits[tier as keyof typeof limits] || 1000;
}

/**
 * Handle streaming chat response
 */
async function handleStreamingResponse(
  res: NextApiResponse,
  chatRequest: any,
  userContext: UserContext,
  requestId: string,
  startTime: number
): Promise<void> {
  // Set up Server-Sent Events headers
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  try {
    await openAICircuitBreaker.execute(async () => {
      await openAIService.createStreamingCompletion(
        chatRequest,
        (chunk: string) => {
          res.write(chunk);
        }
      );
    });

    res.end();

    console.info(`Streaming chat completed`, {
      requestId,
      userId: userContext.id,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    console.error(`Streaming chat failed`, {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.write(`\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.end();
  }
}

/**
 * Handle standard (non-streaming) chat response
 */
async function handleStandardResponse(
  res: NextApiResponse,
  chatRequest: any,
  userContext: UserContext,
  requestId: string,
  startTime: number
): Promise<void> {
  try {
    const response = await openAICircuitBreaker.execute(async () => {
      return await openAIService.createChatCompletion(chatRequest);
    });

    console.info(`Chat completed successfully`, {
      requestId,
      userId: userContext.id,
      model: response.model,
      tokens: response.usage.totalTokens,
      cost: response.usage.estimatedCost,
      processingTime: Date.now() - startTime,
      cacheHit: response.metadata.cacheHit,
      retries: response.metadata.retryCount
    });

    res.status(200).json({
      id: response.id,
      content: response.content,
      model: response.model,
      usage: response.usage,
      metadata: {
        ...response.metadata,
        requestId,
        processingTime: Date.now() - startTime
      },
      functionCalls: response.functionCalls
    });

  } catch (error) {
    console.error(`Chat request failed`, {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return apiError(
      res,
      500,
      "Failed to generate response",
      "OPENAI_ERROR",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, modernChatHandler);
}