import { OpenAI } from 'openai';
import { 
  validateModel, 
  getMaxTokensParam, 
  generateRequestId, 
  logAPICall,
  getModelConfiguration 
} from '@/lib/config/validate-models';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
  maxRetries: 0 // We handle retries manually
});

export interface CallOptions {
  messages?: any[];
  input?: string | any[];
  maxTokens: number;
  stream: boolean;
  temperature?: number;
  signal?: AbortSignal;
  requestId: string;
}

/**
 * Call OpenAI with automatic fallback on failure
 */
export async function callOpenAIWithFallback(
  options: CallOptions,
  customModel?: string
): Promise<any> {
  const config = getModelConfiguration();
  const primaryModel = customModel || config.main;
  const fallbackModel = config.fallback;
  const requestId = options.requestId;
  
  if (!primaryModel) {
    throw new Error('Primary model undefined - check env OPENAI_MODEL');
  }
  
  // Try primary model
  try {
    return await callOpenAI(primaryModel, options, requestId, 'primary');
  } catch (error: any) {
    // Retry with fallback on specific errors
    if ([404, 429, 500, 502, 503].includes(error.status)) {
      console.log('[API_FALLBACK]', {
        from_model: primaryModel,
        to_model: fallbackModel,
        error_status: error.status,
        requestId: requestId
      });
      
      return await callOpenAI(fallbackModel, options, requestId, 'fallback');
    }
    throw error;
  }
}

/**
 * Direct OpenAI call with proper parameter mapping
 */
async function callOpenAI(
  model: string,
  options: CallOptions,
  requestId: string,
  attempt: 'primary' | 'fallback'
): Promise<any> {
  const modelConfig = validateModel(model);
  
  if (!modelConfig.valid) {
    throw new Error(`Invalid model: ${model}`);
  }
  
  // Log the API call
  logAPICall({
    model,
    endpoint: modelConfig.endpoint!,
    streamed: options.stream,
    paramKey: modelConfig.paramKey!,
    requestId,
    attempt
  });
  
  // Build request based on API type
  if (modelConfig.apiType === 'responses') {
    // Responses API format - MUST use responses.create
    const request: any = {
      model,
      max_output_tokens: options.maxTokens, // Responses API uses max_output_tokens
      stream: options.stream
    };
    
    // Responses API expects 'input' not 'messages'
    if (options.input) {
      request.input = options.input;
    } else if (options.messages) {
      // Convert messages to input format for Responses API
      request.input = options.messages.map(m => ({
        role: m.role,
        content: m.content
      }));
    }
    
    // Call Responses API - NOT chat.completions
    return await openai.responses.create(request, { signal: options.signal });
    
  } else {
    // Chat Completions API format
    const request: any = {
      model,
      messages: options.messages || [{ role: 'user', content: options.input as string }],
      max_tokens: options.maxTokens, // Chat API uses max_tokens
      stream: options.stream,
      ...(options.temperature !== undefined && { temperature: options.temperature })
    };
    
    return await openai.chat.completions.create(request, { signal: options.signal });
  }
}

/**
 * Handle streaming responses properly for both APIs
 */
export async function* handleStream(
  response: any,
  apiType: 'responses' | 'chat'
): AsyncGenerator<string, void, unknown> {
  if (apiType === 'responses') {
    // Responses API streaming format
    let buffer = '';
    
    for await (const event of response) {
      // Parse Responses API event structure
      if (event.type === 'response.output_text.delta') {
        // Accumulate delta text
        if (event.output_text?.delta) {
          buffer += event.output_text.delta;
          yield event.output_text.delta;
        }
      } else if (event.type === 'response.completed') {
        // Final flush on completion
        if (buffer.length > 0) {
          // Already yielded incrementally, just signal completion
        }
        break;
      }
    }
  } else {
    // Chat Completions API streaming
    for await (const chunk of response) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

export { openai };