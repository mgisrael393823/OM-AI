/**
 * OpenAI pricing configuration
 * Reads pricing from environment variables with safe parsing and fallbacks
 */

type Price = { 
  input: number; 
  output: number; 
};

type PricingShape = { 
  models: { 
    DEFAULT: Price; 
    ANALYSIS: Price;
    [modelName: string]: Price; // Allow model-specific pricing
  } 
};

/**
 * Parse pricing from environment variable
 */
function parsePricing(): PricingShape {
  const raw = process.env.OPENAI_PRICING_JSON;
  
  try {
    if (!raw) {
      // Return default zero-cost pricing if not configured
      return {
        models: {
          DEFAULT: { input: 0, output: 0 },
          ANALYSIS: { input: 0, output: 0 }
        }
      };
    }
    
    const parsed = JSON.parse(raw) as any;
    
    // Helper to normalize a price object
    const normalizePrice = (p: any): Price => ({
      input: Number(p?.input ?? 0),
      output: Number(p?.output ?? 0)
    });
    
    // Build the pricing structure
    const result: PricingShape = {
      models: {
        DEFAULT: normalizePrice(parsed.models?.DEFAULT),
        ANALYSIS: normalizePrice(parsed.models?.ANALYSIS)
      }
    };
    
    // Add any model-specific pricing
    if (parsed.models && typeof parsed.models === 'object') {
      for (const [key, value] of Object.entries(parsed.models)) {
        if (key !== 'DEFAULT' && key !== 'ANALYSIS') {
          result.models[key] = normalizePrice(value);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Failed to parse OPENAI_PRICING_JSON:', error);
    // Return safe fallback
    return {
      models: {
        DEFAULT: { input: 0, output: 0 },
        ANALYSIS: { input: 0, output: 0 }
      }
    };
  }
}

// Export the parsed pricing
export const PRICING = parsePricing();

/**
 * Get price for a specific model with fallback to bucket pricing
 */
export function priceFor(
  modelName: string, 
  bucket: 'DEFAULT' | 'ANALYSIS' = 'DEFAULT'
): Price {
  // First check if we have model-specific pricing
  const modelPrice = PRICING.models[modelName];
  if (modelPrice && 
      typeof modelPrice.input === 'number' && 
      typeof modelPrice.output === 'number') {
    return modelPrice;
  }
  
  // Fall back to bucket pricing
  return PRICING.models[bucket];
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  bucket: 'DEFAULT' | 'ANALYSIS' = 'DEFAULT'
): number {
  const price = priceFor(modelName, bucket);
  const inputCost = (inputTokens / 1000) * price.input;
  const outputCost = (outputTokens / 1000) * price.output;
  return Number((inputCost + outputCost).toFixed(6));
}