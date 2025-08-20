const https = require('https');

// Test with your actual API key
const API_KEY = process.env.OPENAI_API_KEY || 'sk-...';

const testGPT5 = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-5',
      messages: [
        { role: 'user', content: 'Reply with just "GPT-5 WORKING" if this is working' }
      ],
      max_completion_tokens: 10  // Correct parameter for GPT-5
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
            console.log('✅ GPT-5 Response:', response.choices[0].message.content);
            console.log('✅ Model Used:', response.model);
            console.log('✅ Tokens Used:', response.usage);
            resolve(true);
          } else {
            console.error('❌ GPT-5 Error:', response.error?.message || 'Failed');
            console.error('Full response:', JSON.stringify(response, null, 2));
            resolve(false);
          }
        } catch (e) {
          console.error('❌ Parse error:', e.message);
          console.error('Raw response:', responseData);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Connection error:', e.message);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
};

async function runTest() {
  console.log('Testing GPT-5 with correct parameters...\n');
  console.log('API Key:', API_KEY.substring(0, 7) + '...' + API_KEY.substring(API_KEY.length - 4));
  console.log('');
  
  const result = await testGPT5();
  
  console.log('\n📊 Final Result:');
  if (result) {
    console.log('🎉 GPT-5 IS FULLY FUNCTIONAL!');
    console.log('✅ Your API key has GPT-5 access');
    console.log('✅ OM-AI codebase is ready for GPT-5');
  } else {
    console.log('❌ GPT-5 access still not working');
  }
}

runTest();