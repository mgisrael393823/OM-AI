import { randomUUID } from 'crypto';

// Official OpenAI model catalog
const VALID_MODELS = {
  responses: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'o4', 'o3'],
  chat: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo']
};

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
 * Validate and configure model settings
 */
export function validateModel(model: string): ModelConfig {
  // Check for chat-latest variants first
  if (CHAT_LATEST_PATTERN.test(model)) {
    return {
      valid: true,
      apiType: 'chat',
      paramKey: 'max_completion_tokens',
      endpoint: '/v1/chat/completions'
    };
  }
  
  // Check Responses API models
  if (VALID_MODELS.responses.some(m => model.startsWith(m))) {
    return {
      valid: true,
      apiType: 'responses',
      paramKey: 'max_output_tokens',
      endpoint: '/v1/responses'
    };
  }
  
  // Check Chat Completions API models
  if (VALID_MODELS.chat.some(m => model.startsWith(m))) {
    return {
      valid: true,
      apiType: 'chat',
      paramKey: 'max_completion_tokens',
      endpoint: '/v1/chat/completions'
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
 * Get the correct token parameter for the model
 */
export function getMaxTokensParam(model: string, value: number): Record<string, number> {
  const config = validateModel(model);
  
  if (config.apiType === 'responses') {
    return { max_output_tokens: value };
  } else {
    return { max_completion_tokens: value };
  }
}

/**
 * Generate request ID for logging
 */
export function generateRequestId(prefix: string = 'req'): string {
  return `${prefix}_${Date.now()}_${randomUUID().substring(0, 8)}`;
}

/**
 * Get configured models from environment
 */
export function getModelConfiguration() {
  const useGPT5 = process.env.USE_GPT5 === 'true';
  
  return {
    main: useGPT5 ? (process.env.OPENAI_MODEL || 'gpt-5') : 'gpt-4o',
    fast: useGPT5 ? (process.env.OPENAI_FAST_MODEL || 'gpt-5-mini') : 'gpt-4o-mini',
    fallback: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o',
    useGPT5
  };
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
    request_id: details.requestId,
    attempt: details.attempt || 'primary'
  }));
}