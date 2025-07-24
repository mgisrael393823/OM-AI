/**
 * Simple test script to verify Settings API is working
 * Run with: node test-settings-api.js
 */

const fetch = require('node-fetch').default || require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testSettingsAPI() {
  console.log('🧪 Testing Settings API...\n');
  
  try {
    // Test GET /api/settings
    console.log('Testing GET /api/settings...');
    const getResponse = await fetch(`${BASE_URL}/api/settings`);
    console.log('Status:', getResponse.status);
    
    if (getResponse.status === 404) {
      console.log('❌ Settings API is disabled (feature flag off)');
      return;
    }
    
    if (getResponse.status === 401) {
      console.log('❌ Not authenticated (expected - need to be logged in)');
      return;
    }
    
    const getData = await getResponse.json();
    console.log('Response:', JSON.stringify(getData, null, 2));
    
    // Test PUT /api/settings (will also fail without auth)
    console.log('\nTesting PUT /api/settings...');
    const putResponse = await fetch(`${BASE_URL}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ai: { preferredModel: 'gpt-4', temperature: 0.8, maxTokens: 3000 }
      })
    });
    
    console.log('Status:', putResponse.status);
    const putData = await putResponse.json();
    console.log('Response:', JSON.stringify(putData, null, 2));
    
  } catch (error) {
    console.error('❌ Error testing Settings API:', error.message);
  }
}

// Check if node-fetch is available
async function checkDependencies() {
  try {
    require('node-fetch');
    return true;
  } catch (e) {
    console.log('Installing node-fetch...');
    const { execSync } = require('child_process');
    try {
      execSync('npm install node-fetch@2', { stdio: 'inherit' });
      return true;
    } catch (installError) {
      console.error('Failed to install node-fetch. Please run: npm install node-fetch@2');
      return false;
    }
  }
}

async function main() {
  const hasNodeFetch = await checkDependencies();
  if (hasNodeFetch) {
    await testSettingsAPI();
  }
}

main();