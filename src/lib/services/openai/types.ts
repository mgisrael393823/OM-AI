/**
 * TypeScript types for OpenAI Service
 * Comprehensive type definitions for CRE-specific AI functionality
 */

import OpenAI from 'openai';

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
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

// Property analysis function response
export interface PropertyAnalysis {
  propertyType: 'office' | 'retail' | 'industrial' | 'multifamily' | 'mixed-use' | 'other';
  location: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    market?: string;
  };
  financials: {
    capRate?: number;
    noi?: number;
    grossIncome?: number;
    operatingExpenses?: number;
    cashFlow?: number;
    pricePerSqFt?: number;
  };
  physical: {
    totalSqFt?: number;
    buildingClass?: 'A' | 'B' | 'C';
    yearBuilt?: number;
    parking?: {
      spaces: number;
      ratio: number;
    };
  };
  investment: {
    askingPrice?: number;
    downPayment?: number;
    loanAmount?: number;
    loanTerm?: number;
    interestRate?: number;
    dscr?: number;
  };
  risks: string[];
  opportunities: string[];
  marketComparables?: Array<{
    address: string;
    salePrice: number;
    capRate: number;
    pricePerSqFt: number;
  }>;
}

// Lease analysis function response
export interface LeaseAnalysis {
  totalLeases: number;
  occupancyRate: number;
  averageLeaseRate: number;
  weightedAverageLeaseExpiry: string;
  leaseRollover: Array<{
    year: number;
    sqFtExpiring: number;
    percentOfTotal: number;
    averageRate: number;
  }>;
  tenants: Array<{
    name: string;
    sqFt: number;
    rate: number;
    expiration: string;
    creditRating?: string;
    percentOfIncome: number;
  }>;
  rentBumps: Array<{
    tenant: string;
    date: string;
    increase: number;
    newRate: number;
  }>;
  vacancies: Array<{
    suite: string;
    sqFt: number;
    askingRate: number;
    marketRate: number;
  }>;
}

// Market analysis function response
export interface MarketAnalysis {
  marketOverview: {
    marketName: string;
    submarket?: string;
    population?: number;
    medianIncome?: number;
    unemploymentRate?: number;
  };
  propertyMetrics: {
    vacancyRate: number;
    averageRent: number;
    averageCapRate: number;
    priceAppreciation: number;
    inventory: number;
  };
  trends: Array<{
    metric: string;
    direction: 'increasing' | 'decreasing' | 'stable';
    percentage: number;
    timeframe: string;
  }>;
  comparables: Array<{
    address: string;
    propertyType: string;
    salePrice: number;
    saleDate: string;
    capRate: number;
    pricePerSqFt: number;
    distance: number; // miles from subject
  }>;
  forecast: {
    vacancyRate: number;
    rentGrowth: number;
    capRateDirection: 'compression' | 'expansion' | 'stable';
    outlook: 'positive' | 'negative' | 'neutral';
  };
}

// Investment summary function response
export interface InvestmentSummary {
  executiveSummary: string;
  keyMetrics: {
    capRate: number;
    cashOnCash: number;
    irr: number;
    paybackPeriod: number;
    dscr: number;
  };
  cashFlow: Array<{
    year: number;
    grossIncome: number;
    operatingExpenses: number;
    noi: number;
    debtService: number;
    cashFlow: number;
  }>;
  sensitivity: {
    capRateImpact: Array<{
      scenario: string;
      capRate: number;
      value: number;
      irr: number;
    }>;
    rentImpact: Array<{
      scenario: string;
      rentChange: number;
      noi: number;
      value: number;
    }>;
  };
  swotAnalysis: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  recommendation: {
    rating: 'strong-buy' | 'buy' | 'hold' | 'sell' | 'strong-sell';
    reasoning: string;
    targetPrice: number;
    keyRisks: string[];
  };
}

// Unified CRE function response
export type CREFunctionResponse = 
  | PropertyAnalysis 
  | LeaseAnalysis 
  | MarketAnalysis 
  | InvestmentSummary;

// Enhanced chat message with CRE context
export interface CREChatMessage extends OpenAI.ChatCompletionMessageParam {
  metadata?: {
    documentIds?: string[];
    propertyId?: string;
    analysisType?: 'property' | 'lease' | 'market' | 'investment';
    confidence?: number;
  };
}

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