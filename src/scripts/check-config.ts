#!/usr/bin/env node
/**
 * Configuration check script
 * Run this to verify all environment variables are properly set
 */

// Load environment variables using dotenv for better performance
import { config } from 'dotenv';
import { join } from 'path';

// Fast exit in CI environments
if (process.env.CI || process.env.VERCEL) {
  console.log('🚀 Skipping config check in CI environment');
  process.exit(0);
}

// Load .env.local with dotenv (more efficient than manual parsing)
try {
  config({ path: join(process.cwd(), '.env.local') });
} catch (error) {
  console.warn('Could not load .env.local file');
}

import { checkEnvironment, logConfigStatus, isProduction } from '@/lib/config';

console.log('🔍 Checking configuration...\n');

// Log current configuration status
logConfigStatus();

// Check for errors
const validation = checkEnvironment();

if (validation.isValid) {
  console.log('\n✅ All required environment variables are set!');
  process.exit(0);
} else {
  console.error('\n❌ Configuration errors found:');
  validation.errors.forEach(error => {
    console.error(`   - ${error}`);
  });
  
  if (isProduction()) {
    console.error('\n🚨 Cannot start in production with missing configuration!');
    process.exit(1);
  } else {
    console.warn('\n⚠️  Starting in development mode with missing configuration.');
    console.warn('   Some features may not work properly.');
    process.exit(0);
  }
}