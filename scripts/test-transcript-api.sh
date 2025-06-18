#!/bin/bash
# Test Transcript API endpoints

API_URL="http://localhost:3000/api/transcript"
AUTH_TOKEN="your-auth-token-here"
TEST_VIDEO_ID="dQw4w9WgXcQ"

echo "Testing Transcript API..."
echo "========================"

# Test get transcript
echo -e "\n1. Testing get transcript:"
curl -X GET "${API_URL}/${TEST_VIDEO_ID}?language=en" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

# Test search transcripts
echo -e "\n2. Testing transcript search:"
curl -X GET "${API_URL}/search?query=hello&limit=5" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

# Test process transcript
echo -e "\n3. Testing process transcript:"
curl -X POST "${API_URL}/${TEST_VIDEO_ID}/process" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "en",
    "source": "youtube",
    "autoSegment": true
  }' | jq '.'

# Test speech-to-text (with sample audio URL)
echo -e "\n4. Testing speech-to-text:"
curl -X POST "${API_URL}/speech-to-text" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "audioData": "base64_audio_data_here",
    "language": "en",
    "service": "auto"
  }' | jq '.'

# Test transcript analysis
echo -e "\n5. Testing transcript analysis:"
curl -X GET "${API_URL}/${TEST_VIDEO_ID}/analysis?language=en" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

# Test health
echo -e "\n6. Testing module health:"
curl -X GET "${API_URL}/health" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" | jq '.'
