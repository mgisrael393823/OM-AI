/**
 * Feature Flags Configuration
 * 
 * Centralized configuration for feature toggles to enable safe rollouts
 * and easy rollback of new functionality.
 */

export const FEATURE_FLAGS = {
  // Settings API - Controls new user preferences system
  SETTINGS_API: process.env.NEXT_FEATURE_SETTINGS === 'true',
  // OpenAI Analysis Model - Controls whether to use analysis model for complex queries
  USE_ANALYSIS: (process.env.OPENAI_USE_ANALYSIS || 'false').toLowerCase() === 'true',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}

/**
 * Get all enabled feature flags (useful for debugging)
 */
export function getEnabledFeatures(): FeatureFlag[] {
  return Object.entries(FEATURE_FLAGS)
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag as FeatureFlag);
}

/**
 * Feature flag middleware for API routes
 */
export function requireFeature(flag: FeatureFlag) {
  return (handler: (...args: any[]) => any) => {
    return (...args: any[]) => {
      if (!isFeatureEnabled(flag)) {
        const [, res] = args;
        return res.status(404).json({ 
          error: 'Feature not available',
          code: 'FEATURE_DISABLED'
        });
      }
      return handler(...args);
    };
  };
}

/**
 * Get environment variable with fallback
 */
export function getEnv(name: string, fallback: string = ''): string {
  const value = process.env[name];
  return (value === undefined || value === null || value === '') ? fallback : value;
}