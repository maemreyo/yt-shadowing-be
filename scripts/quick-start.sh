#!/bin/bash
# YouTube Shadowing Backend - Quick Start Implementation

echo "🚀 Starting YouTube Shadowing Backend Implementation..."

# Step 1: Setup Environment Variables
echo "📝 Step 1: Adding environment variables..."
cat >> .env << 'EOF'

# YouTube Shadowing Configuration
YOUTUBE_API_KEY=your-youtube-api-key
YOUTUBE_QUOTA_LIMIT=10000

# Speech-to-Text Services
OPENAI_WHISPER_API_KEY=your-whisper-key
ASSEMBLYAI_API_KEY=your-assemblyai-key
GOOGLE_SPEECH_API_KEY=your-google-speech-key

# Audio Storage (Cloudflare R2)
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY=your-access-key
CLOUDFLARE_R2_SECRET_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=shadowing-audio
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Feature Limits
FREE_TIER_DAILY_MINUTES=30
PRO_TIER_DAILY_MINUTES=300
PREMIUM_TIER_DAILY_MINUTES=-1
RECORDING_MAX_DURATION=300
RECORDING_MAX_SIZE_MB=50

# Enable new modules
TRANSCRIPT_MODULE_ENABLED=true
AUDIO_PROCESSING_MODULE_ENABLED=true
LEARNING_PROGRESS_MODULE_ENABLED=true
YOUTUBE_INTEGRATION_MODULE_ENABLED=true
PRACTICE_SESSION_MODULE_ENABLED=true
EOF

# Step 2: Install Dependencies
echo "📦 Step 2: Installing dependencies..."
pnpm add googleapis youtube-transcript fluent-ffmpeg @ffmpeg-installer/ffmpeg
pnpm add wavesurfer.js @google-cloud/speech openai
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm add -D @types/fluent-ffmpeg

# Step 3: Generate YouTube Integration Module
echo "🔧 Step 3: Generating YouTube Integration module..."
pnpm module:generate <<EOF
youtube-integration
YouTube Integration
YouTube API integration, video metadata, and caption processing
y
y
n
n
y
n
y
n
n
y
user
api-usage
EOF

# Step 4: Generate Transcript Module
echo "🔧 Step 4: Generating Transcript module..."
pnpm module:generate <<EOF
transcript
Transcript Processing
Handle YouTube transcripts and speech-to-text processing
y
y
n
y
y
n
y
n
n
y
user
analytics
api-usage
EOF

# Step 5: Generate Practice Session Module
echo "🔧 Step 5: Generating Practice Session module..."
pnpm module:generate <<EOF
practice-session
Practice Session
Manage practice sessions, state persistence, and resume functionality
y
y
y
n
n
n
n
n
n
y
user
analytics
EOF

# Step 6: Generate Audio Processing Module
echo "🔧 Step 6: Generating Audio Processing module..."
pnpm module:generate <<EOF
audio-processing
Audio Processing
Handle voice recordings, waveform generation, and audio comparison
y
y
n
y
y
n
n
n
n
y
user
analytics
EOF

# Step 7: Generate Learning Progress Module
echo "🔧 Step 7: Generating Learning Progress module..."
pnpm module:generate <<EOF
learning-progress
Learning Progress
Track learning sessions, progress analytics, and recommendations
y
y
y
n
n
n
y
n
n
y
user
analytics
EOF

# Step 8: Update Prisma Schema
echo "📊 Step 8: Adding new models to Prisma schema..."
echo "
// ========== YouTube Shadowing Models ==========

// YouTube Video metadata and transcripts
model Video {
  id               String   @id @default(cuid())
  youtubeVideoId   String   @unique @db.VarChar(20)
  title            String   @db.Text
  duration         Int      // in seconds
  language         String   @db.VarChar(10)
  difficultyLevel  Int      @default(1) // 1-5
  transcriptAvailable Boolean @default(false)

  channelId        String?  @db.VarChar(50)
  channelName      String?  @db.VarChar(255)
  thumbnailUrl     String?  @db.Text
  tags             String[] @db.Text

  metadata         Json?    @db.JsonB

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // Relations
  transcripts      Transcript[]
  practiceSessions PracticeSession[]
  learningProgress LearningProgress[]

  // Indexes
  @@index([youtubeVideoId])
  @@index([language])
  @@index([difficultyLevel])
  @@map(\"videos\")
}

// Add other models from the schema extension...
" >> prisma/schema.prisma

# Step 9: Run Database Migration
echo "🗄️ Step 9: Creating database migration..."
pnpm prisma migrate dev --name add-youtube-shadowing-models

# Step 10: Update module configuration
echo "⚙️ Step 10: Updating module configuration..."
# This would need to be done manually in the module config file

# Step 11: Test modules
echo "✅ Step 11: Testing new modules..."
curl http://localhost:3000/api/youtube-integration/health
curl http://localhost:3000/api/transcript/health
curl http://localhost:3000/api/practice-session/health
curl http://localhost:3000/api/audio-processing/health
curl http://localhost:3000/api/learning-progress/health

echo "
✅ YouTube Shadowing Backend setup complete!

Next steps:
1. Update the Prisma schema with all models (see youtube-shadowing-schema artifact)
2. Implement DTOs in each module (see module-implementation-guide artifact)
3. Update services with business logic
4. Integrate with existing modules (see integration-guide artifact)
5. Add security and rate limiting
6. Test all endpoints

📚 Reference Documents:
- todo.md - Full implementation plan
- YT-SHADOWING-BE.md - Original requirements
- Generated module files in src/modules/

Happy coding! 🚀
"
