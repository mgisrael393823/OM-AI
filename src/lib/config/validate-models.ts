import { randomUUID } from 'crypto';

// Official OpenAI model catalog - exactly 4 models allowed
const VALID_MODELS = {
  gpt5: ['gpt-5', 'gpt-5-mini'],
  gpt4: ['gpt-4o', 'gpt-4o-mini'] 
};

// Strict model allowlist - exactly 4 models total
const ALL_VALID_MODELS = [...VALID_MODELS.gpt5, ...VALID_MODELS.gpt4];

// Model detection patterns
const RESPONSES_MODEL_PATTERN = /^(gpt-5($|-mini|-nano)|gpt-4\.1|o[34])/i;
const CHAT_LATEST_PATTERN = /-chat-latest$/i;

export interface ModelConfig {
  valid: boolean;
  apiType: 'responses' | 'chat' | null;
  paramKey: 'max_output_tokens' | 'max_completion_tokens' | null;
  endpoint: string | null;
}

/**
 * Validate and configure model settings with strict allowlist
 */
export function validateModel(model: string): ModelConfig {
  // Strict validation - model must be exactly in allowlist
  if (!ALL_VALID_MODELS.includes(model)) {
    return {
      valid: false,
      apiType: null,
      paramKey: null,
      endpoint: null
    };
  }
  
  // GPT-5 family uses Responses API with max_completion_tokens
  if (VALID_MODELS.gpt5.includes(model)) {
    return {
      valid: true,
      apiType: 'responses',
      paramKey: 'max_completion_tokens',
      endpoint: '/v1/responses'
    };
  }
  
  // GPT-4o family uses Responses API with max_output_tokens
  if (VALID_MODELS.gpt4.includes(model)) {
    return {
      valid: true,
      apiType: 'responses',
      paramKey: 'max_output_tokens',
      endpoint: '/v1/responses'
    };
  }
  
  return {
    valid: false,
    apiType: null,
    paramKey: null,
    endpoint: null
  };
}

/**
 * Detect API type from model name
 */
export function detectAPIType(model: string): 'responses' | 'chat' {
  if (CHAT_LATEST_PATTERN.test(model)) return 'chat';
  if (RESPONSES_MODEL_PATTERN.test(model)) return 'responses';
  
  // Fail fast on unknown models instead of defaulting
  const validation = validateModel(model);
  if (!validation.valid) {
    throw new Error(`Invalid model: ${model}. Must be one of: ${Object.values(VALID_MODELS).flat().join(', ')}`);
  }
  
  return validation.apiType!;
}

/**
 * Get the correct token parameter for the model (exclusive usage)
 */
export function getMaxTokensParam(model: string, value: number): Record<string, number> {
  const config = validateModel(model);
  
  if (!config.valid) {
    throw new Error(`Invalid model: ${model}. Must be one of: ${ALL_VALID_MODELS.join(', ')}`);
  }
  
  // GPT-5 family uses max_completion_tokens
  if (VALID_MODELS.gpt5.includes(model)) {
    return { max_completion_tokens: value };
  }
  
  // GPT-4o family uses max_output_tokens
  if (VALID_MODELS.gpt4.includes(model)) {
    return { max_output_tokens: value };
  }
  
  throw new Error(`MODEL_UNAVAILABLE: ${model}`);
}

/**
 * Model to parameter mapping helper for exclusive usage
 */
export function getTokenParamForModel(model: string): { paramKey: string, apiType: 'responses' | 'chat' } {
  if (!ALL_VALID_MODELS.includes(model)) {
    throw new Error(`MODEL_UNAVAILABLE: ${model}. Must be one of: ${ALL_VALID_MODELS.join(', ')}`);
  }
  
  // GPT-5 family uses max_completion_tokens
  if (VALID_MODELS.gpt5.includes(model)) {
    return { paramKey: 'max_completion_tokens', apiType: 'responses' };
  }
  
  // GPT-4o family uses max_output_tokens  
  if (VALID_MODELS.gpt4.includes(model)) {
    return { paramKey: 'max_output_tokens', apiType: 'responses' };
  }
  
  throw new Error(`MODEL_UNAVAILABLE: ${model}`);
}

/**
 * Clean token parameter selection for API usage
 */
export function selectTokenParam(model: string): { paramKey: string, apiType: string } {
  if (!ALL_VALID_MODELS.includes(model)) {
    throw new Error(`MODEL_UNAVAILABLE: ${model}. Must be one of: ${ALL_VALID_MODELS.join(', ')}`);
  }
  
  // GPT-5 family → max_completion_tokens
  if (VALID_MODELS.gpt5.includes(model)) {
    return { paramKey: 'max_completion_tokens', apiType: 'responses' };
  }
  
  // GPT-4o family → max_output_tokens  
  if (VALID_MODELS.gpt4.includes(model)) {
    return { paramKey: 'max_output_tokens', apiType: 'responses' };
  }
  
  throw new Error(`MODEL_UNAVAILABLE: ${model}`);
}

/**
 * Generate request ID for logging
 */
export function generateRequestId(prefix: string = 'req'): string {
  return `${prefix}_${Date.now()}_${randomUUID().substring(0, 8)}`;
}

/**
 * Get configured models from environment with proper defaults
 */
export function getModelConfiguration() {
  const useGPT5 = process.env.USE_GPT5 === 'true';
  
  return {
    main: process.env.OPENAI_MODEL || (useGPT5 ? 'gpt-5' : 'gpt-4o'),
    fast: process.env.OPENAI_FAST_MODEL || (useGPT5 ? 'gpt-5-mini' : 'gpt-4o-mini'),
    fallback: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini',
    useGPT5
  };
}

/**
 * Validate environment model configuration at startup
 * Throws error for invalid models to fail fast
 */
export function validateEnvironmentModels() {
  const config = getModelConfiguration();
  const models = [config.main, config.fast, config.fallback];
  
  for (const model of models) {
    if (!ALL_VALID_MODELS.includes(model)) {
      throw new Error(
        `Invalid model in environment: ${model}. Must be one of: ${ALL_VALID_MODELS.join(', ')}`
      );
    }
  }
  
  return config;
}

/**
 * Validate model for request-time use (for tests and runtime validation)
 * Returns error info instead of throwing for graceful handling
 */
export function validateRequestModel(model: string): { valid: boolean; error?: string } {
  if (!ALL_VALID_MODELS.includes(model)) {
    return {
      valid: false,
      error: `Model '${model}' is not supported. Must be one of: ${ALL_VALID_MODELS.join(', ')}`
    };
  }
  return { valid: true };
}

/**
 * Log API call details (no PII)
 */
export function logAPICall(details: {
  model: string;
  endpoint: string;
  streamed: boolean;
  paramKey: string;
  requestId: string;
  attempt?: 'primary' | 'fallback';
}) {
  console.log('[API_CALL]', JSON.stringify({
    timestamp: new Date().toISOString(),
    model: details.model,
    endpoint: details.endpoint,
    streamed: details.streamed,
    param_key: details.paramKey,
    requestId: details.requestId,
    attempt: details.attempt || 'primary'
  }));
}