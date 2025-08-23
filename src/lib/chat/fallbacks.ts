import { callOpenAIWithFallback, type CallOptions } from '@/lib/services/openai/client-wrapper'

export function callWithFallback(
  options: CallOptions & { requestId: string; signal?: AbortSignal },
  customModel?: string
): Promise<any> {
  return callOpenAIWithFallback(options, customModel)
}

// TODO: expand cascade/text fallback utilities