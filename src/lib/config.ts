/**
 * Centralized configuration validation and helpers
 * Ensures all required environment variables are available at runtime
 */

export interface ConfigValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates all required environment variables
 * @throws Error with details about missing variables
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  // Supabase requirements
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is required");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  }

  // Service role key is only required for API routes
  if (typeof window === 'undefined' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is required for API routes");
  }

  // OpenAI is required for chat functionality
  if (!process.env.OPENAI_API_KEY) {
    errors.push("OPENAI_API_KEY is required for chat functionality");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * Validates environment without throwing, returns validation result
 */
export function checkEnvironment(): ConfigValidation {
  try {
    validateEnvironment();
    return { isValid: true, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errors = message.split('\n').filter(line => line.trim());
    return { isValid: false, errors };
  }
}

/**
 * Check if OpenAI is properly configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get configuration with defaults for development
 */
export function getConfig() {
  return {
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      isDummy: !process.env.OPENAI_API_KEY && !isProduction(),
    },
    app: {
      environment: process.env.NODE_ENV || 'development',
      isProduction: isProduction(),
    }
  };
}

/**
 * Log configuration status (without exposing secrets)
 */
export function logConfigStatus(): void {
  const config = getConfig();
  console.log('Configuration Status:', {
    environment: config.app.environment,
    supabase: {
      url: config.supabase.url ? '✓ Set' : '✗ Missing',
      anonKey: config.supabase.anonKey ? '✓ Set' : '✗ Missing',
      serviceRoleKey: config.supabase.serviceRoleKey ? '✓ Set' : '✗ Missing',
    },
    openai: {
      apiKey: config.openai.apiKey ? '✓ Set' : '✗ Missing',
      usingDummy: config.openai.isDummy,
    }
  });
}