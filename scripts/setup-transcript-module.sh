#!/bin/bash
# scripts/setup-transcript-module.sh
# Setup and test Transcript module

echo "📝 Setting up Transcript Module"
echo "==============================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Create module structure
echo -e "${YELLOW}Step 1: Creating module structure...${NC}"

mkdir -p src/modules/transcript/__tests__
mkdir -p src/modules/transcript/types

# Step 2: Generate module using pnpm
echo -e "\n${YELLOW}Step 2: Generating module skeleton...${NC}"

# Create a temporary expect script
cat > /tmp/generate-transcript-module.exp << 'EOF'
#!/usr/bin/expect -f
set timeout 30

spawn pnpm module:generate

expect "Module name:"
send "transcript\r"

expect "Display name:"
send "Transcript Processing\r"

expect "Description:"
send "Handle YouTube transcripts and speech-to-text processing\r"

expect "Include RESTful API endpoints?"
send "y\r"

expect "Include database models?"
send "y\r"

expect "Include event system?"
send "y\r"

expect "Include background jobs?"
send "y\r"

expect "Include WebSocket support?"
send "n\r"

expect "Include caching layer?"
send "y\r"

expect "Include rate limiting?"
send "n\r"

expect "Include file upload?"
send "n\r"

expect "Include email templates?"
send "n\r"

expect "Include analytics tracking?"
send "y\r"

expect "Select dependencies"
send "user analytics api-usage youtube-integration\r"

expect eof
EOF

chmod +x /tmp/generate-transcript-module.exp

# Run if module doesn't exist
if [ ! -f "src/modules/transcript/index.ts" ]; then
  if command -v expect >/dev/null 2>&1; then
    expect /tmp/generate-transcript-module.exp
  else
    echo -e "${YELLOW}Warning: 'expect' not found. Please run 'pnpm module:generate' manually${NC}"
  fi
fi

rm -f /tmp/generate-transcript-module.exp

# Step 3: Install speech-to-text dependencies
echo -e "\n${YELLOW}Step 3: Installing speech-to-text dependencies...${NC}"

# Core dependencies
pnpm add openai @google-cloud/speech assemblyai

# Additional NLP dependencies
pnpm add natural compromise sentiment

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 4: Update module configuration
echo -e "\n${YELLOW}Step 4: Updating module configuration...${NC}"

# Check if module is registered
if ! grep -q "transcriptRoutes" src/app.ts; then
  echo -e "${YELLOW}Note: Remember to register Transcript routes in src/app.ts:${NC}"
  echo -e "  import transcriptRoutes from '@modules/transcript';"
  echo -e "  app.register(transcriptRoutes, { prefix: '/api/transcript' });"
fi

# Step 5: Create API test script
echo -e "\n${YELLOW}Step 5: Creating API test script...${NC}"

cat > scripts/test-transcript-api.sh << 'EOF'
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
EOF

chmod +x scripts/test-transcript-api.sh

echo -e "${GREEN}✓ API test script created${NC}"

# Step 6: Create sample transcript processor
echo -e "\n${YELLOW}Step 6: Creating sample transcript processor...${NC}"

cat > scripts/process-transcript.js << 'EOF'
#!/usr/bin/env node
// Sample script to process a YouTube video transcript

const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-token';

async function processVideo(videoId) {
  try {
    console.log(`Processing video: ${videoId}`);

    // First, get video info
    const videoResponse = await axios.get(
      `${API_URL}/youtube/video/${videoId}`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    console.log(`Video: ${videoResponse.data.data.title}`);

    // Get transcript
    const transcriptResponse = await axios.get(
      `${API_URL}/transcript/${videoId}`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const transcript = transcriptResponse.data.data;
    console.log(`Transcript found: ${transcript.sentences.length} sentences`);
    console.log(`Difficulty: ${transcript.difficulty}/5`);
    console.log(`Duration: ${Math.round(transcript.duration / 60)} minutes`);

    // Analyze transcript
    const analysisResponse = await axios.get(
      `${API_URL}/transcript/${videoId}/analysis`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const analysis = analysisResponse.data.data;
    console.log(`\nAnalysis:`);
    console.log(`- Speaking rate: ${Math.round(analysis.averageSpeakingRate)} WPM`);
    console.log(`- Vocabulary level: ${analysis.vocabularyLevel}`);
    console.log(`- Suitable for: ${analysis.suitableForLevels.join(', ')}`);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Get video ID from command line
const videoId = process.argv[2];
if (!videoId) {
  console.log('Usage: node process-transcript.js <videoId>');
  process.exit(1);
}

processVideo(videoId);
EOF

chmod +x scripts/process-transcript.js

echo -e "${GREEN}✓ Sample processor created${NC}"

# Step 7: Create transcript export utility
echo -e "\n${YELLOW}Step 7: Creating transcript export utility...${NC}"

cat > scripts/export-transcript.sh << 'EOF'
#!/bin/bash
# Export transcript in different formats

VIDEO_ID=$1
FORMAT=${2:-srt}
OUTPUT_FILE=${3:-transcript.$FORMAT}

if [ -z "$VIDEO_ID" ]; then
  echo "Usage: $0 <video_id> [format] [output_file]"
  echo "Formats: srt, vtt, txt, json"
  exit 1
fi

API_URL="http://localhost:3000/api/transcript"
AUTH_TOKEN=${AUTH_TOKEN:-"your-token"}

echo "Exporting transcript for video: $VIDEO_ID"
echo "Format: $FORMAT"

curl -s -X GET "${API_URL}/${VIDEO_ID}/export?format=${FORMAT}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -o "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
  echo "Transcript exported to: $OUTPUT_FILE"
else
  echo "Failed to export transcript"
fi
EOF

chmod +x scripts/export-transcript.sh

echo -e "${GREEN}✓ Export utility created${NC}"

# Step 8: Summary
echo -e "\n${GREEN}========================================"
echo -e "✅ Transcript Module Setup Complete!"
echo -e "========================================${NC}"
echo
echo "Module features configured:"
echo "  ✓ YouTube transcript fetching"
echo "  ✓ Speech-to-text conversion"
echo "  ✓ Transcript segmentation"
echo "  ✓ Difficulty analysis"
echo "  ✓ Search functionality"
echo "  ✓ Export capabilities"
echo
echo "Next steps:"
echo "1. Add speech-to-text API keys to .env:"
echo "   - OPENAI_WHISPER_API_KEY"
echo "   - GOOGLE_SPEECH_API_KEY (optional)"
echo "   - ASSEMBLYAI_API_KEY (optional)"
echo
echo "2. Register routes in src/app.ts"
echo "3. Update module configuration"
echo "4. Test the API: ./scripts/test-transcript-api.sh"
echo
echo -e "${YELLOW}Utilities created:${NC}"
echo "  - scripts/test-transcript-api.sh - Test all endpoints"
echo "  - scripts/process-transcript.js - Process video transcripts"
echo "  - scripts/export-transcript.sh - Export transcripts"
echo
echo -e "${YELLOW}Module files:${NC}"
echo "  - src/modules/transcript/transcript.dto.ts"
echo "  - src/modules/transcript/transcript.service.ts"
echo "  - src/modules/transcript/transcript.controller.ts"
echo "  - src/modules/transcript/transcript.route.ts"
echo "  - src/modules/transcript/transcript.events.ts"
echo "  - src/modules/transcript/index.ts"
echo "  - src/modules/transcript/README.md"
