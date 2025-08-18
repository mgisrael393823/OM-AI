#!/usr/bin/env node

/**
 * Configuration Check Script
 * 
 * Validates required environment variables for different deployment environments.
 * Fails the build early on Vercel when KV configuration is missing.
 */

const vercelEnv = process.env.VERCEL_ENV

console.log('🔍 Running configuration check...')
console.log(`Environment: ${vercelEnv || 'local development'}`)

// Check KV configuration for preview and production environments
if (vercelEnv === 'preview' || vercelEnv === 'production') {
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN
  
  if (!kvUrl || !kvToken) {
    console.error(`\n❌ KV: missing for ${vercelEnv}`)
    console.error('\nRequired environment variables not found:')
    
    if (!kvUrl) {
      console.error('  - KV_REST_API_URL')
    }
    if (!kvToken) {
      console.error('  - KV_REST_API_TOKEN')
    }
    
    console.error('\nPlease add these environment variables in Vercel Dashboard:')
    console.error('  1. Go to your project settings')
    console.error('  2. Navigate to Environment Variables')
    console.error('  3. Add KV_REST_API_URL and KV_REST_API_TOKEN')
    console.error('  4. Ensure they are set for Preview and Production environments\n')
    
    process.exit(1)
  }
  
  console.log(`✅ KV configuration validated for ${vercelEnv}`)
} else {
  console.log('ℹ️  KV: memory (dev fallback)')
}

// Additional checks can be added here in the future

console.log('✅ Config check passed\n')
process.exit(0)