#!/usr/bin/env node
/**
 * Configuration check script
 * Run this to verify all environment variables are properly set
 */

// Load environment variables from .env.local manually since tsx doesn't auto-load them
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envPath = join(process.cwd(), '.env.local');
  const envFile = readFileSync(envPath, 'utf8');
  
  // Parse .env.local manually
  envFile.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...values] = line.split('=');
      process.env[key.trim()] = values.join('=').trim();
    }
  });
} catch (error) {
  console.warn('Could not load .env.local file');
}

import { checkEnvironment, logConfigStatus, isProduction } from '../lib/config';

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