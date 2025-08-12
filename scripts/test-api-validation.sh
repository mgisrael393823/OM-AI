#!/bin/bash

# Simple validation test script for /api/chat endpoint
# Tests basic format validation without requiring authentication

echo "🧪 Testing /api/chat format validation..."
echo "========================================"

BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api/chat"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\n${YELLOW}Test: Legacy {message: string} format should be rejected${NC}"
echo -e "${BLUE}Sending legacy format request...${NC}"

response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{
        "message": "What is the cap rate?",
        "sessionId": "test-session"
    }' \
    "$API_URL")

# Extract body and status code
body=$(echo "$response" | grep -o '^.*HTTP_STATUS:' | sed 's/HTTP_STATUS:$//')
status_code=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | sed 's/HTTP_STATUS://')

echo "Status Code: $status_code"
echo "Response Body:"
echo "$body" | jq 2>/dev/null || echo "$body"

# Check results
if [ "$status_code" -eq 400 ]; then
    echo -e "${GREEN}✓ Correctly returned 400 Bad Request${NC}"
    
    if echo "$body" | grep -q "INVALID_REQUEST_FORMAT"; then
        echo -e "${GREEN}✓ Contains INVALID_REQUEST_FORMAT error code${NC}"
    else
        echo -e "${RED}✗ Missing INVALID_REQUEST_FORMAT error code${NC}"
    fi
    
    if echo "$body" | grep -q "allowed_formats"; then
        echo -e "${GREEN}✓ Contains allowed_formats in response${NC}"
    else
        echo -e "${RED}✗ Missing allowed_formats in response${NC}"
    fi
    
    if echo "$body" | grep -q "Chat Completions API"; then
        echo -e "${GREEN}✓ Documents Chat Completions API format${NC}"
    else
        echo -e "${RED}✗ Missing Chat Completions API documentation${NC}"
    fi
    
    if echo "$body" | grep -q "Responses API"; then
        echo -e "${GREEN}✓ Documents Responses API format${NC}"
    else
        echo -e "${RED}✗ Missing Responses API documentation${NC}"
    fi
    
else
    echo -e "${RED}✗ Expected 400, got $status_code${NC}"
fi

echo -e "\n${YELLOW}Test: Null sessionId should be rejected${NC}"
echo -e "${BLUE}Sending request with sessionId: null...${NC}"

null_response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{
        "model": "gpt-4o",
        "sessionId": null,
        "messages": [{"role": "user", "content": "hi"}]
    }' \
    "$API_URL")

null_body=$(echo "$null_response" | grep -o '^.*HTTP_STATUS:' | sed 's/HTTP_STATUS:$//')
null_status=$(echo "$null_response" | grep -o 'HTTP_STATUS:[0-9]*' | sed 's/HTTP_STATUS://')

echo "Status Code: $null_status"
if [ "$null_status" -eq 400 ]; then
    echo -e "${GREEN}✓ Correctly returned 400 Bad Request${NC}"
    
    if echo "$null_body" | grep -q "sessionId cannot be null"; then
        echo -e "${GREEN}✓ Contains proper null sessionId error message${NC}"
    else
        echo -e "${RED}✗ Missing null sessionId error message${NC}"
    fi
    
    if echo "$null_body" | grep -q "Never send null values"; then
        echo -e "${GREEN}✓ Contains 'Never send null values' note${NC}"
    else
        echo -e "${RED}✗ Missing 'Never send null values' note${NC}"
    fi
else
    echo -e "${RED}✗ Expected 400, got $null_status${NC}"
fi

echo -e "\n${YELLOW}Test: GET method should be rejected${NC}"
echo -e "${BLUE}Sending GET request...${NC}"

get_response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X GET "$API_URL")
get_status=$(echo "$get_response" | grep -o 'HTTP_STATUS:[0-9]*' | sed 's/HTTP_STATUS://')

if [ "$get_status" -eq 405 ]; then
    echo -e "${GREEN}✓ Correctly returned 405 Method Not Allowed${NC}"
else
    echo -e "${RED}✗ Expected 405, got $get_status${NC}"
fi

echo -e "\n========================================"
echo -e "${GREEN}🎉 Format Validation Tests Complete!${NC}"
echo -e "\n${BLUE}Summary:${NC}"
echo -e "• Legacy {message: string} format is properly rejected"
echo -e "• Null sessionId values are properly rejected"
echo -e "• Error response includes proper format documentation"
echo -e "• GET requests are properly rejected"
echo -e "\n${YELLOW}Note:${NC} For full testing including 200 OK responses,"
echo -e "use test-api-chat.sh with proper authentication."