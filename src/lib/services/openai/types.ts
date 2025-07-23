/**
 * TypeScript types for OpenAI Service
 * Comprehensive type definitions for CRE-specific AI functionality
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { 
  PropertyAnalysisSchema, 
  LeaseAnalysisSchema, 
  MarketAnalysisSchema, 
  InvestmentSummarySchema 
} from './functions';

// Subscription tiers matching database schema
export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

// User context for rate limiting and personalization
export interface UserContext {
  id: string;
  email: string;
  subscriptionTier: SubscriptionTier;
  usageCount: number;
  usageLimit: number;
  preferences?: {
    preferredModel?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

// CRE-specific function definitions
export interface CREFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>; // Allow flexible schema structures
    required: string[];
  };
}

// Infer types from Zod schemas to keep them in sync
export type PropertyAnalysis = z.infer<typeof PropertyAnalysisSchema>;

export type LeaseAnalysis = z.infer<typeof LeaseAnalysisSchema>;

export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

export type InvestmentSummary = z.infer<typeof InvestmentSummarySchema>;

// Unified CRE function response
export type CREFunctionResponse = 
  | PropertyAnalysis 
  | LeaseAnalysis 
  | MarketAnalysis 
  | InvestmentSummary;

// Enhanced chat message with CRE context
export type CREChatMessage = OpenAI.ChatCompletionMessageParam & {
  metadata?: {
    documentIds?: string[];
    propertyId?: string;
    analysisType?: 'property' | 'lease' | 'market' | 'investment';
    confidence?: number;
  };
};

// Document context for enhanced analysis
export interface DocumentContext {
  documentIds: string[];
  relevantChunks: Array<{
    content: string;
    pageNumber: number;
    chunkType: 'paragraph' | 'table' | 'header' | 'footer' | 'list';
    documentName: string;
    relevanceScore: number;
  }>;
  totalTokens: number;
  compressionRatio?: number;
}

// Rate limiting configuration per subscription tier
export interface RateLimitConfig {
  requestsPerDay: number;
  requestsPerHour: number;
  tokensPerDay: number;
  maxConcurrentRequests: number;
  allowedModels: string[];
  features: {
    functionCalling: boolean;
    documentAnalysis: boolean;
    marketData: boolean;
    advancedMetrics: boolean;
  };
}

// Default rate limits by subscription tier
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, RateLimitConfig> = {
  starter: {
    requestsPerDay: 50,
    requestsPerHour: 10,
    tokensPerDay: 25000,
    maxConcurrentRequests: 2,
    allowedModels: ['gpt-4o-mini'],
    features: {
      functionCalling: false,
      documentAnalysis: true,
      marketData: false,
      advancedMetrics: false
    }
  },
  professional: {
    requestsPerDay: 500,
    requestsPerHour: 50,
    tokensPerDay: 250000,
    maxConcurrentRequests: 5,
    allowedModels: ['gpt-4o-mini', 'gpt-4o'],
    features: {
      functionCalling: true,
      documentAnalysis: true,
      marketData: true,
      advancedMetrics: true
    }
  },
  enterprise: {
    requestsPerDay: 2000,
    requestsPerHour: 200,
    tokensPerDay: 1000000,
    maxConcurrentRequests: 10,
    allowedModels: ['gpt-4o-mini', 'gpt-4o'],
    features: {
      functionCalling: true,
      documentAnalysis: true,
      marketData: true,
      advancedMetrics: true
    }
  }
};

// Cache configuration
export interface CacheConfig {
  ttl: number; // milliseconds
  maxSize: number;
  keyPrefix: string;
}

// Circuit breaker states
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors: string[];
}

// Service health status
export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: {
    avg: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  circuitBreakerState: CircuitBreakerState;
  cachePerformance: {
    hitRate: number;
    size: number;
    evictions: number;
  };
  rateLimit: {
    remaining: number;
    resetTime: Date;
  };
}

// Error types for better error handling
export enum OpenAIErrorType {
  RATE_LIMIT = 'rate_limit_exceeded',
  INSUFFICIENT_QUOTA = 'insufficient_quota',
  MODEL_OVERLOADED = 'model_overloaded',
  CONTEXT_LENGTH = 'context_length_exceeded',
  CONTENT_FILTER = 'content_filter',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown_error'
}

// Custom error class for OpenAI service
export class OpenAIServiceError extends Error {
  constructor(
    message: string,
    public type: OpenAIErrorType,
    public statusCode?: number,
    public retryable: boolean = false,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'OpenAIServiceError';
  }
}

// Validation schemas for function responses
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}

// Monitoring and logging interfaces
export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata: Record<string, any>;
  requestId?: string;
  userId?: string;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
}