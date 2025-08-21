import * as dotenv from 'dotenv'

// Load .local first, then .development.local overrides
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env.development.local', override: true })

// Only require OPENAI_API_KEY
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY required. Check .env files.')
  process.exit(1)
}

console.log('✅ Environment loaded successfully')

import { getModelConfiguration, getTokenParamForModel } from './src/lib/config/validate-models'

console.log('Testing GPT-5 configuration...')

// Test the model configuration
const config = getModelConfiguration()
console.log('✅ Resolved models:', {
  primary: config.main,
  fast: config.fast, 
  fallback: config.fallback,
  useGPT5: config.useGPT5
})

// Verify GPT-5 is enabled
console.log('✅ USE_GPT5:', config.useGPT5 ? 'ENABLED' : 'DISABLED')
console.log('✅ Main model:', config.main)
console.log('✅ Fast model:', config.fast)
console.log('✅ Fallback model:', config.fallback)

// Test parameter mapping for GPT-5
const gpt5Param = getTokenParamForModel('gpt-5')
console.log('✅ GPT-5 parameter mapping:', gpt5Param)

const gpt5MiniParam = getTokenParamForModel('gpt-5-mini')
console.log('✅ GPT-5-mini parameter mapping:', gpt5MiniParam)

// Test GPT-4o parameter mapping
const gpt4oParam = getTokenParamForModel('gpt-4o')
console.log('✅ GPT-4o parameter mapping:', gpt4oParam)

const gpt4oMiniParam = getTokenParamForModel('gpt-4o-mini')
console.log('✅ GPT-4o-mini parameter mapping:', gpt4oMiniParam)

// Verify environment variables
console.log('\n🔧 Environment Variables:')
console.log('   USE_GPT5:', process.env.USE_GPT5)
console.log('   OPENAI_MODEL:', process.env.OPENAI_MODEL)
console.log('   OPENAI_FAST_MODEL:', process.env.OPENAI_FAST_MODEL)
console.log('   OPENAI_FALLBACK_MODEL:', process.env.OPENAI_FALLBACK_MODEL)

if (config.useGPT5 && config.main === 'gpt-5' && config.fast === 'gpt-5-mini') {
  console.log('\n🎉 GPT-5 configuration is CORRECT!')
} else {
  console.log('\n❌ GPT-5 configuration needs attention')
  console.log('Expected: primary=gpt-5, fast=gpt-5-mini when USE_GPT5=true')
}