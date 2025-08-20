const https = require('https');

// Test with your actual API key
const API_KEY = process.env.OPENAI_API_KEY || 'sk-...';

const testModel = (model) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: 'Reply with just "OK" if working' }
      ],
      max_tokens: 10
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (res.statusCode === 200) {
            console.log(`✅ ${model}: Working`);
            resolve(true);
          } else {
            console.error(`❌ ${model}: ${response.error?.message || 'Failed'}`);
            resolve(false);
          }
        } catch (e) {
          console.error(`❌ ${model}: Invalid response`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ ${model}: Connection error`);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
};

async function runTests() {
  console.log('Testing OpenAI API access...\n');
  console.log('API Key:', API_KEY.substring(0, 7) + '...' + API_KEY.substring(API_KEY.length - 4));
  console.log('');
  
  const results = {
    'gpt-4o': await testModel('gpt-4o'),
    'gpt-4o-mini': await testModel('gpt-4o-mini'),
    'gpt-5': await testModel('gpt-5'),
    'gpt-5-mini': await testModel('gpt-5-mini')
  };
  
  console.log('\n📊 Summary:');
  console.log('Current models (should work):', results['gpt-4o'] && results['gpt-4o-mini'] ? '✅' : '❌');
  console.log('GPT-5 access:', results['gpt-5'] ? '✅ AVAILABLE' : '❌ NOT AVAILABLE');
  
  if (!results['gpt-5']) {
    console.log('\n⚠️  GPT-5 is not accessible with this API key.');
    console.log('You may need to:');
    console.log('1. Request GPT-5 access from OpenAI');
    console.log('2. Use a different API key with GPT-5 access');
    console.log('3. Continue using gpt-4o until GPT-5 access is granted');
  }
}

runTests();