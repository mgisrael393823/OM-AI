// Simple test to check sessions API behavior
// Usage: node test-sessions.js

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/chat-sessions',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer dummy-token-for-testing',
    'Content-Type': 'application/json'
  }
};

console.log('Testing sessions API endpoint...');
console.log('Making request to:', `http://${options.hostname}:${options.port}${options.path}`);

const req = http.request(options, (res) => {
  console.log(`Response status: ${res.statusCode}`);
  console.log(`Response headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body:', data);
  });
});

req.on('error', (e) => {
  console.error(`Request error: ${e.message}`);
});

req.end();