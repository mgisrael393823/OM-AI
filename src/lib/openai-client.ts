import OpenAI from 'openai';
import { getConfig, isProduction, isOpenAIConfigured } from './config';

const config = getConfig();

// Only throw error if we're in production and OpenAI is not configured
if (!config.openai.apiKey && isProduction()) {
  throw new Error('Missing OPENAI_API_KEY in production. Please set OPENAI_API_KEY in your environment variables.');
}

// Create OpenAI client - use dummy key ONLY in development
const apiKey = config.openai.apiKey || (!isProduction() ? 'sk-dummy-development-key' : '');

if (!apiKey) {
  throw new Error('Cannot initialize OpenAI client without API key');
}

// Create OpenAI client with validated API key
export const openai = new OpenAI({
  apiKey,
  // Optional: Add timeout and retry configuration
  timeout: 60000, // 60 seconds
  maxRetries: 3,
});

// Re-export the config helper
export { isOpenAIConfigured };

// Export a type-safe wrapper for the Responses API
export async function createResponse(options: {
  model: string;
  messages: OpenAI.ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  functions?: any[];
}) {
  // Note: The OpenAI SDK doesn't have a 'responses.create' method.
  // We'll use the standard chat.completions.create with streaming
  return openai.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 2000,
    stream: options.stream ?? true,
    functions: options.functions,
  });
}