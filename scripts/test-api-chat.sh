#!/bin/bash

# Manual cURL Test Script for /api/chat endpoint
# Tests both accepted schemas and rejection cases

echo "🧪 Testing /api/chat endpoint validation..."
echo "================================================="

BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api/chat"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to make authenticated request (you may need to update this)
make_request() {
    local method="$1"
    local url="$2" 
    local data="$3"
    local expected_status="$4"
    
    echo -e "\n${BLUE}Making request:${NC}"
    echo "Method: $method"
    echo "URL: $url"
    echo "Data: $data"
    echo "Expected Status: $expected_status"
    echo -e "${BLUE}----------------------------------------${NC}"
    
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer YOUR_AUTH_TOKEN_HERE" \
        -d "$data" \
        "$url")
    
    # Extract body and status code
    body=$(echo "$response" | head -n -1)
    status_code=$(echo "$response" | tail -n 1)
    
    echo -e "Status: $status_code"
    echo -e "Response: $body" | jq 2>/dev/null || echo "$body"
    
    if [ "$status_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ Test passed${NC}"
    else
        echo -e "${RED}✗ Test failed - Expected $expected_status, got $status_code${NC}"
    fi
    
    return $status_code
}

echo -e "\n${YELLOW}Test 1: Chat Completions API Format (should return 200)${NC}"
make_request "POST" "$API_URL" '{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "What is the cap rate for this property?"}
  ],
  "sessionId": "test-session-123",
  "stream": false
}' 200

echo -e "\n${YELLOW}Test 2: Responses API Format with Input String (should return 200)${NC}"
make_request "POST" "$API_URL" '{
  "model": "gpt-5", 
  "input": "What is the cap rate for this property?",
  "sessionId": "test-session-456",
  "stream": false,
  "max_output_tokens": 1000
}' 200

echo -e "\n${YELLOW}Test 3: Responses API Format with Messages (should return 200)${NC}"
make_request "POST" "$API_URL" '{
  "model": "gpt-5",
  "messages": [
    {"role": "user", "content": "What is the cap rate for this property?"}
  ],
  "sessionId": "test-session-789",
  "stream": false,
  "max_output_tokens": 1000
}' 200

echo -e "\n${YELLOW}Test 4: Legacy Message Format (should return 400 with INVALID_REQUEST_FORMAT)${NC}"
response=$(make_request "POST" "$API_URL" '{
  "message": "What is the cap rate?",
  "sessionId": "test-session-legacy"
}' 400)

# Check if the error contains the expected code
if echo "$response" | grep -q "INVALID_REQUEST_FORMAT"; then
    echo -e "${GREEN}✓ Correct error code returned${NC}"
else
    echo -e "${RED}✗ Expected INVALID_REQUEST_FORMAT error code${NC}"
fi

echo -e "\n${YELLOW}Test 5: GET Request (should return 405 Method Not Allowed)${NC}"
make_request "GET" "$API_URL" '{}' 405

echo -e "\n${YELLOW}Test 6: Invalid JSON (should return 400)${NC}"
curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_AUTH_TOKEN_HERE" \
    -d '{"invalid": json}' \
    "$API_URL" > /dev/null
echo -e "${BLUE}Invalid JSON test completed${NC}"

echo -e "\n================================================="
echo -e "${GREEN}🎉 API Chat Endpoint Tests Complete!${NC}"
echo -e "\n${BLUE}To run authenticated tests:${NC}"
echo -e "1. Start your dev server: npm run dev"
echo -e "2. Update YOUR_AUTH_TOKEN_HERE with a valid JWT token"
echo -e "3. Run this script: bash scripts/test-api-chat.sh"
echo -e "\n${BLUE}Expected Results:${NC}"
echo -e "✓ Tests 1-3: 200 OK with AI response"
echo -e "✓ Test 4: 400 Bad Request with INVALID_REQUEST_FORMAT" 
echo -e "✓ Test 5: 405 Method Not Allowed"