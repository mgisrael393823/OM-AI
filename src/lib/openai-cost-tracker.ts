import { createClient } from '@supabase/supabase-js'
import { getConfig } from './config'
import type { Database } from '@/types/database'

// OpenAI pricing as of 2024 (per 1000 tokens)
const PRICING = {
  'gpt-4': {
    input: 0.03,
    output: 0.06
  },
  'gpt-4-turbo': {
    input: 0.01,
    output: 0.03
  },
  'gpt-4o': {
    input: 0.005,
    output: 0.015
  },
  'gpt-3.5-turbo': {
    input: 0.0005,
    output: 0.0015
  }
} as const

type ModelName = keyof typeof PRICING

interface UsageData {
  model: string
  inputTokens: number
  outputTokens: number
}

interface LimitCheckResult {
  daily_tokens: number
  daily_cost: number
  is_within_limits: boolean
}

export class OpenAICostTracker {
  private supabase: ReturnType<typeof createClient<Database>>
  
  // Hard limits that trigger circuit breaker
  private readonly EMERGENCY_STOP_DAILY = 50 // $50 per day absolute max
  private readonly EMERGENCY_STOP_TOTAL = 500 // $500 total absolute max
  
  constructor() {
    const config = getConfig()
    this.supabase = createClient<Database>(
      config.supabase.url,
      config.supabase.serviceRoleKey
    )
  }

  /**
   * Calculate cost for a given usage
   */
  calculateCost(usage: UsageData): number {
    const modelKey = this.normalizeModelName(usage.model)
    const pricing = PRICING[modelKey] || PRICING['gpt-3.5-turbo'] // Default to cheapest
    
    const inputCost = (usage.inputTokens / 1000) * pricing.input
    const outputCost = (usage.outputTokens / 1000) * pricing.output
    
    return Number((inputCost + outputCost).toFixed(4))
  }

  /**
   * Check if user is within limits BEFORE making the API call
   */
  async checkLimitsBeforeCall(userId: string): Promise<{
    canProceed: boolean
    reason?: string
    usage?: LimitCheckResult
  }> {
    try {
      // Use new typed RPC for getting daily cost
      type DailyCostRow = Database["public"]["Functions"]["get_openai_daily_cost"]["Returns"][number]
      
      const { data, error } = await this.supabase
        .rpc('get_openai_daily_cost', { p_user: userId })

      if (error) {
        console.error('Error checking OpenAI daily cost:', error)
        // Be conservative - if we can't check, don't allow
        return { 
          canProceed: false, 
          reason: 'Unable to verify usage limits' 
        }
      }

      // Safely extract daily cost with type guard and numeric coercion
      const costData = data as DailyCostRow[] | null
      const dailyCost = Number(costData?.[0]?.daily_cost ?? 0)

      // Check emergency stop conditions
      if (dailyCost >= this.EMERGENCY_STOP_DAILY) {
        return {
          canProceed: false,
          reason: `Daily cost limit exceeded ($${this.EMERGENCY_STOP_DAILY})`,
          usage: {
            daily_tokens: 0, // We don't have token count from new function
            daily_cost: dailyCost,
            is_within_limits: false
          }
        }
      }

      // Check against configured daily limit (default $10)
      const dailyLimit = 10.00 // TODO: Make this configurable
      if (dailyCost >= dailyLimit) {
        return {
          canProceed: false,
          reason: `Daily limit exceeded ($${dailyCost.toFixed(2)} of $${dailyLimit})`,
          usage: {
            daily_tokens: 0,
            daily_cost: dailyCost,
            is_within_limits: false
          }
        }
      }

      return {
        canProceed: true,
        usage: {
          daily_tokens: 0, // We don't track tokens in the new function
          daily_cost: dailyCost,
          is_within_limits: true
        }
      }
    } catch (error) {
      console.error('Error in checkLimitsBeforeCall:', error)
      return { 
        canProceed: false, 
        reason: 'System error checking limits' 
      }
    }
  }

  /**
   * Track usage AFTER the API call completes
   */
  async trackUsage(userId: string, usage: UsageData): Promise<void> {
    try {
      const cost = this.calculateCost(usage)
      
      // Track in database
      const { error } = await this.supabase.rpc('track_openai_usage', {
        p_user_id: userId,
        p_model: usage.model,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_estimated_cost: cost
      })

      if (error) {
        console.error('Error tracking OpenAI usage:', error)
      } else {
        console.log(`Tracked OpenAI usage for user ${userId}:`, {
          model: usage.model,
          tokens: usage.inputTokens + usage.outputTokens,
          cost: `$${cost.toFixed(4)}`
        })
      }
    } catch (error) {
      console.error('Error in trackUsage:', error)
    }
  }

  /**
   * Get user's usage summary for today
   */
  async getDailyUsage(userId: string): Promise<{
    tokens: number
    cost: number
    requests: number
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('openai_usage')
        .select('total_tokens, estimated_cost, requests_count')
        .eq('user_id', userId)
        .eq('date', new Date().toISOString().split('T')[0])

      if (error || !data) {
        return null
      }

      return {
        tokens: data.reduce((sum, row) => sum + (row.total_tokens || 0), 0),
        cost: data.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0),
        requests: data.reduce((sum, row) => sum + (row.requests_count || 0), 0)
      }
    } catch (error) {
      console.error('Error getting daily usage:', error)
      return null
    }
  }

  /**
   * Normalize model names to match our pricing keys
   */
  private normalizeModelName(model: string): ModelName {
    if (model.includes('gpt-4o')) return 'gpt-4o'
    if (model.includes('gpt-4-turbo')) return 'gpt-4-turbo'
    if (model.includes('gpt-4')) return 'gpt-4'
    if (model.includes('gpt-3.5')) return 'gpt-3.5-turbo'
    return 'gpt-3.5-turbo' // Default fallback
  }
}

// Singleton instance
let tracker: OpenAICostTracker | null = null

export function getOpenAICostTracker(): OpenAICostTracker {
  if (!tracker) {
    tracker = new OpenAICostTracker()
  }
  return tracker
}