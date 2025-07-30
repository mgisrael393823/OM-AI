/**
 * Startup validation for critical environment variables and services
 * This should be called early in the application lifecycle
 */

interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  details: Record<string, any>
}

interface EnvironmentConfig {
  name: string
  required: boolean
  validator?: (value: string) => boolean | string
  description: string
}

const REQUIRED_ENV_VARS: EnvironmentConfig[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    validator: (value) => {
      if (!value.startsWith('https://')) return 'Must start with https://'
      if (!value.includes('supabase.co')) return 'Must be a valid Supabase URL'
      return true
    },
    description: 'Supabase project URL for client connections'
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    validator: (value) => {
      if (value.length < 100) return 'Service role key appears too short'
      if (!value.startsWith('eyJ')) return 'Service role key should be a JWT token'
      return true
    },
    description: 'Supabase service role key for server-side operations'
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    validator: (value) => {
      if (value.length < 100) return 'Anon key appears too short'
      if (!value.startsWith('eyJ')) return 'Anon key should be a JWT token'
      return true
    },
    description: 'Supabase anonymous key for client authentication'
  },
  {
    name: 'NODE_ENV',
    required: true,
    validator: (value) => {
      const validEnvs = ['development', 'production', 'test']
      if (!validEnvs.includes(value)) return `Must be one of: ${validEnvs.join(', ')}`
      return true
    },
    description: 'Node.js environment mode'
  }
]

const OPTIONAL_ENV_VARS: EnvironmentConfig[] = [
  {
    name: 'OPENAI_API_KEY',
    required: false,
    validator: (value) => {
      if (!value.startsWith('sk-')) return 'OpenAI API key should start with sk-'
      return true
    },
    description: 'OpenAI API key for chat functionality'
  },
  {
    name: 'SENTRY_DSN',
    required: false,
    validator: (value) => {
      if (!value.startsWith('https://')) return 'Sentry DSN should start with https://'
      return true
    },
    description: 'Sentry DSN for error monitoring'
  }
]

/**
 * Validate all required environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const details: Record<string, any> = {
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    validatedVars: {},
    missingVars: [],
    invalidVars: []
  }

  console.log('🔍 Environment Validation: Starting validation', {
    nodeEnv: process.env.NODE_ENV,
    timestamp: details.timestamp
  })

  // Check required environment variables
  for (const config of REQUIRED_ENV_VARS) {
    const value = process.env[config.name]
    
    if (!value) {
      errors.push(`Missing required environment variable: ${config.name} (${config.description})`)
      details.missingVars.push(config.name)
      continue
    }

    // Run custom validator if provided
    if (config.validator) {
      const validationResult = config.validator(value)
      if (validationResult !== true) {
        errors.push(`Invalid ${config.name}: ${validationResult}`)
        details.invalidVars.push({ name: config.name, error: validationResult })
        continue
      }
    }

    details.validatedVars[config.name] = {
      present: true,
      length: value.length,
      preview: config.name.includes('KEY') ? '***hidden***' : value.substring(0, 20) + '...'
    }
  }

  // Check optional environment variables
  for (const config of OPTIONAL_ENV_VARS) {
    const value = process.env[config.name]
    
    if (!value) {
      warnings.push(`Optional environment variable missing: ${config.name} (${config.description})`)
      continue
    }

    // Run custom validator if provided
    if (config.validator) {
      const validationResult = config.validator(value)
      if (validationResult !== true) {
        warnings.push(`Invalid ${config.name}: ${validationResult}`)
        continue
      }
    }

    details.validatedVars[config.name] = {
      present: true,
      length: value.length,
      preview: config.name.includes('KEY') ? '***hidden***' : value.substring(0, 20) + '...'
    }
  }

  // Additional environment checks
  if (process.env.NODE_ENV === 'production') {
    // Production-specific validations
    if (!process.env.OPENAI_API_KEY) {
      errors.push('OpenAI API key is required in production for chat functionality')
    }
    
    if (!process.env.SENTRY_DSN) {
      warnings.push('Sentry DSN is recommended for production error monitoring')
    }
  }

  const isValid = errors.length === 0

  console.log('🔍 Environment Validation: Completed', {
    isValid,
    errorsCount: errors.length,
    warningsCount: warnings.length,
    validatedVarsCount: Object.keys(details.validatedVars).length
  })

  if (errors.length > 0) {
    console.error('❌ Environment Validation: Errors found:', errors)
  }

  if (warnings.length > 0) {
    console.warn('⚠️ Environment Validation: Warnings:', warnings)
  }

  return {
    isValid,
    errors,
    warnings,
    details
  }
}

/**
 * Validate environment and throw error if critical issues found
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment()
  
  if (!result.isValid) {
    const errorMessage = `Environment validation failed:\n${result.errors.join('\n')}`
    console.error('💥 Critical environment validation failure:', errorMessage)
    throw new Error(errorMessage)
  }
  
  if (result.warnings.length > 0) {
    console.warn('⚠️ Environment validation completed with warnings:', result.warnings.join(', '))
  } else {
    console.log('✅ Environment validation passed successfully')
  }
}

/**
 * Get environment validation status for health checks
 */
export function getEnvironmentStatus(): {
  status: 'healthy' | 'unhealthy' | 'warning'
  message: string
  details: ValidationResult
} {
  const validation = validateEnvironment()
  
  if (!validation.isValid) {
    return {
      status: 'unhealthy',
      message: `Environment validation failed: ${validation.errors.length} errors`,
      details: validation
    }
  }
  
  if (validation.warnings.length > 0) {
    return {
      status: 'warning',
      message: `Environment has ${validation.warnings.length} warnings`,
      details: validation
    }
  }
  
  return {
    status: 'healthy',
    message: 'All environment variables validated successfully',
    details: validation
  }
}