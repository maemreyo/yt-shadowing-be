#!/bin/bash
# Test YouTube Integration API endpoints

API_URL="http://localhost:3000/api/youtube"
AUTH_TOKEN="your-auth-token-here"

echo "Testing YouTube Integration API..."
echo "================================="

# Test search
echo -e "\n1. Testing video search:"
curl -X GET "${API_URL}/search?query=learn%20english&maxResults=5" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

# Test video info
echo -e "\n2. Testing video info:"
curl -X GET "${API_URL}/video/dQw4w9WgXcQ" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

# Test captions
echo -e "\n3. Testing video captions:"
curl -X GET "${API_URL}/captions/dQw4w9WgXcQ?language=en" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

# Test validation
echo -e "\n4. Testing video validation:"
curl -X POST "${API_URL}/validate" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"videoId":"dQw4w9WgXcQ"}' | jq '.'

# Test health
echo -e "\n5. Testing module health:"
curl -X GET "${API_URL}/health" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" | jq '.'
