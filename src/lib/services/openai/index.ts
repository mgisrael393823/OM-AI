/**
 * OpenAI Service Layer for CRE Analysis Platform
 * 
 * Production-ready OpenAI integration with:
 * - Model fallback logic for cost optimization
 * - Retry with exponential backoff
 * - Performance monitoring and error handling
 * - Subscription-based usage tracking
 */

import OpenAI from 'openai';
import { performance } from 'perf_hooks';
import { v4 as uuidv4 } from 'uuid';
import { FEATURE_FLAGS, getEnv } from '@/lib/feature-flags';
import { estimateTokens } from '@/lib/tokenizer';

// Service configuration types
export interface OpenAIServiceConfig {
  apiKey: string;
  organization?: string;
  timeout: number;
  maxRetries: number;
  enableFallback: boolean;
  enableMonitoring: boolean;
}

// Model configuration with fallback chain
export interface ModelConfig {
  primary: string;
  fallback: string;
  costPerToken: {
    input: number; // $ per 1K tokens
    output: number; // $ per 1K tokens
  };
  contextWindow: number;
  maxTokens: number;
}

// Request options for chat completions
export interface ChatCompletionRequest {
  messages: OpenAI.ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  functions?: OpenAI.ChatCompletionCreateParams.Function[];
  userId?: string;
  sessionId?: string;
  documentContext?: string;
}

// Response with enhanced metadata
export interface ChatCompletionResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  metadata: {
    processingTimeMs: number;
    retryCount: number;
    cacheHit: boolean;
    modelFallback: boolean;
  };
  functionCalls?: OpenAI.ChatCompletionMessage.FunctionCall[];
}

// Performance and error metrics
export interface ServiceMetrics {
  requestId: string;
  userId?: string;
  model: string;
  processingTimeMs: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
  success: boolean;
  errorType?: string;
  retryCount: number;
  cacheHit: boolean;
  timestamp: Date;
}

// Model configurations optimized for CRE use cases
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-4o': {
    primary: 'gpt-4o',
    fallback: 'gpt-4o-mini',
    costPerToken: {
      input: 0.0025,  // $2.50 per 1M tokens
      output: 0.01    // $10 per 1M tokens
    },
    contextWindow: 128000,
    maxTokens: 4096
  },
  'gpt-4o-mini': {
    primary: 'gpt-4o-mini',
    fallback: 'gpt-3.5-turbo',
    costPerToken: {
      input: 0.00015, // $0.15 per 1M tokens
      output: 0.0006  // $0.60 per 1M tokens
    },
    contextWindow: 128000,
    maxTokens: 16384
  }
};

/**
 * Model routing options
 */
export type ModelRouteOptions = {
  mode?: 'chat' | 'analysis';
  estInputTokens?: number;
  requiresTableExtraction?: boolean;
};

/**
 * Pick the appropriate model based on request characteristics
 */
export function pickModel(opts: ModelRouteOptions = {}): string {
  const defaultModel = getEnv('OPENAI_DEFAULT_MODEL', 'gpt-4o-mini');
  const analysisModel = getEnv('OPENAI_ANALYSIS_MODEL', 'gpt-4o');
  
  // Kill switch: if analysis is disabled, always use default
  if (!FEATURE_FLAGS.USE_ANALYSIS) {
    return defaultModel;
  }
  
  // Determine if this is a heavy request
  const isHeavy = 
    opts.mode === 'analysis' ||
    (opts.estInputTokens ?? 0) > 12000 ||
    !!opts.requiresTableExtraction;
  
  return isHeavy ? analysisModel : defaultModel;
}

export class OpenAIService {
  private client: OpenAI;
  private config: OpenAIServiceConfig;
  private metrics: ServiceMetrics[] = [];
  private cache = new Map<string, { response: ChatCompletionResponse; timestamp: number }>();
  
  constructor(config: Partial<OpenAIServiceConfig> = {}) {
    this.config = {
      apiKey: process.env.OPENAI_API_KEY || '',
      timeout: 30000, // 30 seconds
      maxRetries: 3,
      enableFallback: true,
      enableMonitoring: true,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      organization: this.config.organization,
      timeout: this.config.timeout,
      maxRetries: 0 // We handle retries ourselves
    });
  }

  /**
   * Main chat completion method with full feature set
   */
  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const requestId = uuidv4();
    const startTime = performance.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(request);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return { ...cached, metadata: { ...cached.metadata, cacheHit: true } };
    }

      let lastError: Error | null = null;
    let retryCount = 0;
    let modelFallback = false;
    let currentModel = request.model || 'gpt-4o';

    // Retry loop with exponential backoff
    while (retryCount <= this.config.maxRetries) {
      try {
        const response = await this.makeRequest(request, currentModel, requestId);
        
        // Cache successful responses
        this.setCache(cacheKey, response);
        
        // Record metrics
        if (this.config.enableMonitoring) {
          this.recordMetrics(requestId, request, response, retryCount, false, startTime);
        }
        
        return {
          ...response,
          metadata: {
            ...response.metadata,
            retryCount,
            modelFallback,
            cacheHit: false
          }
        };
        
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        console.warn(`OpenAI request failed (attempt ${retryCount}):`, {
          error: lastError.message,
          model: currentModel,
          requestId
        });
        
        // Try model fallback on certain errors
        if (this.shouldTryFallback(lastError, currentModel) && this.config.enableFallback) {
          const fallbackModel = this.getFallbackModel(currentModel);
          if (fallbackModel && fallbackModel !== currentModel) {
            console.info(`Falling back from ${currentModel} to ${fallbackModel}`);
            currentModel = fallbackModel;
            modelFallback = true;
            retryCount = 0; // Reset retry count for fallback model
            continue;
          }
        }
        
        // Exit if we've exhausted retries
        if (retryCount > this.config.maxRetries) {
          break;
        }
        
        // Exponential backoff with jitter
        const delay = this.calculateBackoffDelay(retryCount);
        await this.sleep(delay);
      }
    }
    
    // Record failed request metrics
    if (this.config.enableMonitoring && lastError) {
      this.recordFailedMetrics(requestId, request, lastError, retryCount, startTime);
    }

    const message = lastError ? lastError.message : 'Unknown error';
    throw new Error(`OpenAI service failed after ${retryCount} attempts: ${message}`);
  }

  /**
   * Streaming chat completion for real-time responses
   */
  async createStreamingCompletion(
    request: ChatCompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResponse> {
    const streamRequest = { ...request, stream: true };
    const requestId = uuidv4();
    const startTime = performance.now();
    
    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 };
    let retryCount = 0;
    const currentModel = request.model || 'gpt-4o';

    while (retryCount <= this.config.maxRetries) {
      try {
        const stream = await this.client.chat.completions.create({
          model: currentModel,
          messages: streamRequest.messages,
          temperature: streamRequest.temperature || 0.7,
          max_tokens: streamRequest.maxTokens || MODEL_CONFIGS[currentModel]?.maxTokens || 2000,
          stream: true,
          functions: streamRequest.functions
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            onChunk(content);
          }
          
          // Capture usage info if available
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
              estimatedCost: this.calculateCost(currentModel, chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
            };
          }
        }

        const response: ChatCompletionResponse = {
          id: requestId,
          content: fullContent,
          model: currentModel,
          usage,
          metadata: {
            processingTimeMs: performance.now() - startTime,
            retryCount,
            cacheHit: false,
            modelFallback: currentModel !== (request.model || 'gpt-4o')
          }
        };

        // Record successful streaming metrics
        if (this.config.enableMonitoring) {
          this.recordMetrics(requestId, streamRequest, response, retryCount, false, startTime);
        }

        return response;

      } catch (error) {
        retryCount++;
        console.warn(`Streaming request failed (attempt ${retryCount}):`, error);
        
        if (retryCount > this.config.maxRetries) {
          throw error;
        }
        
        const delay = this.calculateBackoffDelay(retryCount);
        await this.sleep(delay);
      }
    }

    throw new Error('Streaming completion failed after maximum retries');
  }

  /**
   * Make the actual OpenAI API request
   */
  private async makeRequest(
    request: ChatCompletionRequest,
    model: string,
    _requestId: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<ChatCompletionResponse> {
    const modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-4o'];
    
    const response = await this.client.chat.completions.create({
      model,
      messages: request.messages,
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || modelConfig.maxTokens,
      stream: false,
      functions: request.functions
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response choices returned from OpenAI');
    }

    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const estimatedCost = this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

    return {
      id: response.id,
      content: choice.message.content || '',
      model: response.model,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCost
      },
      metadata: {
        processingTimeMs: 0, // Set by caller
        retryCount: 0, // Set by caller
        cacheHit: false,
        modelFallback: false
      },
      functionCalls: choice.message.function_call ? [choice.message.function_call] : undefined
    };
  }

  /**
   * Determine if we should try a fallback model
   */
  private shouldTryFallback(error: Error, currentModel: string): boolean {
    const fallbackTriggers = [
      'rate_limit_exceeded',
      'model_overloaded',
      'insufficient_quota',
      'context_length_exceeded'
    ];
    
    return fallbackTriggers.some(trigger => 
      error.message.toLowerCase().includes(trigger)
    ) && this.getFallbackModel(currentModel) !== null;
  }

  /**
   * Get fallback model for the current model
   */
  private getFallbackModel(currentModel: string): string | null {
    return MODEL_CONFIGS[currentModel]?.fallback || null;
  }

  /**
   * Calculate cost based on token usage and model
   */
  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const config = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-4o'];
    const promptCost = (promptTokens / 1000) * config.costPerToken.input;
    const completionCost = (completionTokens / 1000) * config.costPerToken.output;
    return promptCost + completionCost;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(retryCount: number): number {
    const baseDelay = 1000; // 1 second
    const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 0.5 + 0.75; // 75-125% of calculated delay
    return Math.min(exponentialDelay * jitter, 30000); // Max 30 seconds
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: ChatCompletionRequest): string {
    const keyData = {
      messages: request.messages,
      model: request.model || 'gpt-4o',
      temperature: request.temperature || 0.7,
      functions: request.functions
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * Get cached response
   */
  private getFromCache(key: string): ChatCompletionResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const TTL = 300000; // 5 minutes
    if (Date.now() - cached.timestamp > TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.response;
  }

  /**
   * Cache response
   */
  private setCache(key: string, response: ChatCompletionResponse): void {
    const MAX_CACHE_SIZE = 1000;
    
    if (this.cache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Record successful request metrics
   */
  private recordMetrics(
    requestId: string,
    request: ChatCompletionRequest,
    response: ChatCompletionResponse,
    retryCount: number,
    cacheHit: boolean,
    startTime: number
  ): void {
    const metrics: ServiceMetrics = {
      requestId,
      userId: request.userId,
      model: response.model,
      processingTimeMs: performance.now() - startTime,
      tokenUsage: {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens
      },
      cost: response.usage.estimatedCost,
      success: true,
      retryCount,
      cacheHit,
      timestamp: new Date()
    };
    
    this.metrics.push(metrics);
    
    // Log structured metrics
    console.info('OpenAI request completed', {
      requestId,
      model: response.model,
      tokens: response.usage.totalTokens,
      cost: response.usage.estimatedCost,
      time: metrics.processingTimeMs,
      retries: retryCount
    });
  }

  /**
   * Record failed request metrics
   */
  private recordFailedMetrics(
    requestId: string,
    request: ChatCompletionRequest,
    error: Error,
    retryCount: number,
    startTime: number
  ): void {
    const metrics: ServiceMetrics = {
      requestId,
      userId: request.userId,
      model: request.model || 'gpt-4o',
      processingTimeMs: performance.now() - startTime,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      cost: 0,
      success: false,
      errorType: error.constructor.name,
      retryCount,
      cacheHit: false,
      timestamp: new Date()
    };
    
    this.metrics.push(metrics);
    
    console.error('OpenAI request failed', {
      requestId,
      error: error.message,
      retries: retryCount,
      time: metrics.processingTimeMs
    });
  }

  /**
   * Get service performance analytics
   */
  getMetrics(): {
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    totalCost: number;
    cacheHitRate: number;
    modelUsage: Record<string, number>;
  } {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        averageLatency: 0,
        totalCost: 0,
        cacheHitRate: 0,
        modelUsage: {}
      };
    }

    const successful = this.metrics.filter(m => m.success);
    const cached = this.metrics.filter(m => m.cacheHit);
    
    const modelUsage = this.metrics.reduce((acc, m) => {
      acc[m.model] = (acc[m.model] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRequests: this.metrics.length,
      successRate: (successful.length / this.metrics.length) * 100,
      averageLatency: successful.reduce((sum, m) => sum + m.processingTimeMs, 0) / successful.length,
      totalCost: this.metrics.reduce((sum, m) => sum + m.cost, 0),
      cacheHitRate: (cached.length / this.metrics.length) * 100,
      modelUsage
    };
  }

  /**
   * Clear cache and reset metrics
   */
  reset(): void {
    this.cache.clear();
    this.metrics = [];
  }
}

// Export singleton instance
export const openAIService = new OpenAIService();