/**
 * Token estimation utility for OpenAI models
 * Uses tiktoken for accurate counting with fallback to character-based estimation
 */

export async function estimateTokens(text: string): Promise<number> {
  try {
    // Dynamically import tiktoken to avoid bundling issues
    const tiktoken = await import("tiktoken")
    const { encoding_for_model } = tiktoken
    
    // Get model from env or use default
    const modelName = process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini"
    
    // Create encoder for specific model
    const enc = encoding_for_model(modelName as any)
    
    // Count tokens
    const tokens = enc.encode(text || "").length
    
    // Free memory
    if (typeof enc.free === 'function') {
      enc.free()
    }
    
    return tokens
  } catch (error) {
    // Fallback to simple character-based estimation
    // Average is ~4 characters per token for English text
    return Math.ceil((text?.length || 0) / 4)
  }
}

/**
 * Estimate tokens for multiple texts
 */
export async function estimateTokensBatch(texts: string[]): Promise<number> {
  let total = 0
  for (const text of texts) {
    total += await estimateTokens(text)
  }
  return total
}

/**
 * Check if text exceeds token limit
 */
export async function exceedsTokenLimit(
  text: string,
  limit: number
): Promise<boolean> {
  const tokens = await estimateTokens(text)
  return tokens > limit
}