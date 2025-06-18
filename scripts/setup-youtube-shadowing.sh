#!/bin/bash
# Phase 1: Database Schema & Core Setup

echo "🚀 YouTube Shadowing Backend - Phase 1 Setup"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists pnpm; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi

if ! command_exists psql; then
    echo -e "${YELLOW}Warning: PostgreSQL client not found${NC}"
    echo "Make sure PostgreSQL is running"
fi

# Step 1: Backup current schema
echo -e "\n${YELLOW}Step 1: Backing up current schema...${NC}"
cp prisma/schema.prisma prisma/schema.prisma.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ Schema backup created${NC}"

# Step 2: Add YouTube Shadowing models to schema
echo -e "\n${YELLOW}Step 2: Adding YouTube Shadowing models to schema...${NC}"

# Check if models already exist
if grep -q "model Video" prisma/schema.prisma; then
    echo -e "${YELLOW}YouTube Shadowing models already exist in schema${NC}"
else
    echo "
// ==================== YouTube Shadowing Models ====================

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

// Video transcripts with timestamps
model Transcript {
  id            String   @id @default(cuid())
  videoId       String
  language      String   @db.VarChar(10)

  sentences     Json     @db.JsonB // Array of {text, startTime, endTime}
  fullText      String   @db.Text

  source        String   @default(\"youtube\") // youtube, whisper, manual
  confidence    Float?   @default(1.0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  video         Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([videoId, language])
  @@index([videoId])
  @@map(\"transcripts\")
}

// User practice sessions
model PracticeSession {
  id          String    @id @default(cuid())
  userId      String
  videoId     String

  startTime   DateTime  @default(now())
  endTime     DateTime?
  totalDuration Int?    // in seconds

  settings    Json      @db.JsonB // {speed, loopCount, autoPlay, etc}
  progress    Json      @db.JsonB // {currentPosition, completedSentences, etc}

  // Relations
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  video       Video     @relation(fields: [videoId], references: [id])
  recordings  Recording[]

  // Indexes
  @@index([userId])
  @@index([videoId])
  @@index([startTime])
  @@map(\"practice_sessions\")
}

// User voice recordings
model Recording {
  id                String   @id @default(cuid())
  userId            String
  sessionId         String

  sentenceIndex     Int
  sentenceStartTime Float    // in seconds
  sentenceEndTime   Float

  audioUrl          String   @db.Text
  audioDuration     Float    // in seconds
  audioSize         Int      // in bytes

  waveformData      Json?    @db.JsonB
  transcription     String?  @db.Text

  qualityScore      Float?   // 0-100
  pronunciationScore Float?  // 0-100
  fluencyScore      Float?   // 0-100

  createdAt         DateTime @default(now())

  // Relations
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  session           PracticeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([userId])
  @@index([sessionId])
  @@index([createdAt])
  @@map(\"recordings\")
}

// Learning progress tracking
model LearningProgress {
  id               String   @id @default(cuid())
  userId           String
  videoId          String

  sentenceIndex    Int
  completedAt      DateTime @default(now())

  difficultyMarked Boolean  @default(false)
  attemptsCount    Int      @default(1)
  bestScore        Float?

  timeSpent        Int      // in seconds

  // Relations
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  video            Video    @relation(fields: [videoId], references: [id])

  // Constraints & Indexes
  @@unique([userId, videoId, sentenceIndex])
  @@index([userId])
  @@index([videoId])
  @@index([completedAt])
  @@map(\"learning_progress\")
}

// YouTube API quota tracking
model YouTubeApiUsage {
  id          String   @id @default(cuid())

  endpoint    String   @db.VarChar(100)
  quotaCost   Int

  requestData Json?    @db.JsonB
  responseCode Int

  createdAt   DateTime @default(now())

  // Indexes
  @@index([createdAt])
  @@index([endpoint])
  @@map(\"youtube_api_usage\")
}" >> prisma/schema.prisma

    echo -e "${GREEN}✓ YouTube Shadowing models added to schema${NC}"
fi

# Step 3: Update User model relations
echo -e "\n${YELLOW}Step 3: Updating User model relations...${NC}"

# Check if relations already exist
if grep -q "practiceSessions PracticeSession\[\]" prisma/schema.prisma; then
    echo -e "${YELLOW}User relations already updated${NC}"
else
    # Find the User model and add relations before the closing }
    sed -i '/model User {/,/^}/ {
        /^}/ i\  // YouTube Shadowing relations\
  practiceSessions PracticeSession[]\
  recordings       Recording[]\
  learningProgress LearningProgress[]
    }' prisma/schema.prisma

    echo -e "${GREEN}✓ User model relations updated${NC}"
fi

# Step 4: Run Prisma format to validate schema
echo -e "\n${YELLOW}Step 4: Validating Prisma schema...${NC}"
pnpm prisma format
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Schema is valid${NC}"
else
    echo -e "${RED}✗ Schema validation failed${NC}"
    echo "Please check prisma/schema.prisma for errors"
    exit 1
fi

# Step 5: Generate Prisma migration
echo -e "\n${YELLOW}Step 5: Creating database migration...${NC}"
pnpm prisma migrate dev --name add-youtube-shadowing-models

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migration created and applied successfully${NC}"
else
    echo -e "${RED}✗ Migration failed${NC}"
    echo "Please check your database connection and try again"
    exit 1
fi

# Step 6: Setup environment variables
echo -e "\n${YELLOW}Step 6: Setting up environment variables...${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ .env backup created${NC}"

# Add YouTube Shadowing configuration if not exists
if ! grep -q "YOUTUBE_API_KEY" .env; then
    echo "

# ==================== YouTube Shadowing Configuration ====================

# YouTube API
YOUTUBE_API_KEY=your-youtube-api-key-here
YOUTUBE_QUOTA_LIMIT=10000

# Speech-to-Text Services
OPENAI_WHISPER_API_KEY=your-whisper-key-here
ASSEMBLYAI_API_KEY= # Optional
GOOGLE_SPEECH_API_KEY= # Optional

# Audio Storage (Cloudflare R2)
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id-here
CLOUDFLARE_R2_ACCESS_KEY=your-access-key-here
CLOUDFLARE_R2_SECRET_KEY=your-secret-key-here
CLOUDFLARE_R2_BUCKET=shadowing-audio
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Feature Limits
FREE_TIER_DAILY_MINUTES=30
PRO_TIER_DAILY_MINUTES=300
PREMIUM_TIER_DAILY_MINUTES=-1 # unlimited
RECORDING_MAX_DURATION=300 # 5 minutes in seconds
RECORDING_MAX_SIZE_MB=50

# Module Toggles
TRANSCRIPT_MODULE_ENABLED=true
AUDIO_PROCESSING_MODULE_ENABLED=true
LEARNING_PROGRESS_MODULE_ENABLED=true
YOUTUBE_INTEGRATION_MODULE_ENABLED=true
PRACTICE_SESSION_MODULE_ENABLED=true" >> .env

    echo -e "${GREEN}✓ YouTube Shadowing environment variables added${NC}"
    echo -e "${YELLOW}⚠️  Please update the API keys in .env file${NC}"
else
    echo -e "${YELLOW}YouTube Shadowing configuration already exists in .env${NC}"
fi

# Step 7: Install required dependencies
echo -e "\n${YELLOW}Step 7: Installing required dependencies...${NC}"

echo "Installing core dependencies..."
pnpm add googleapis youtube-transcript fluent-ffmpeg @ffmpeg-installer/ffmpeg

echo "Installing audio processing dependencies..."
pnpm add wavesurfer.js @google-cloud/speech openai

echo "Installing storage dependencies..."
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

echo "Installing development dependencies..."
pnpm add -D @types/fluent-ffmpeg

echo -e "${GREEN}✓ All dependencies installed${NC}"

# Step 8: Create necessary directories
echo -e "\n${YELLOW}Step 8: Creating necessary directories...${NC}"

mkdir -p src/modules/youtube-integration
mkdir -p src/modules/transcript
mkdir -p src/modules/practice-session
mkdir -p src/modules/audio-processing
mkdir -p src/modules/learning-progress
mkdir -p uploads/audio
mkdir -p temp

echo -e "${GREEN}✓ Directories created${NC}"

# Step 9: Update todo.md to mark Phase 1 complete
echo -e "\n${YELLOW}Step 9: Updating todo.md...${NC}"

if [ -f todo.md ]; then
    # Update checkboxes for completed tasks
    sed -i 's/- \[ \] Create migration for `videos` table/- [x] Create migration for `videos` table/' todo.md
    sed -i 's/- \[ \] Create migration for `practice_sessions` table/- [x] Create migration for `practice_sessions` table/' todo.md
    sed -i 's/- \[ \] Create migration for `recordings` table/- [x] Create migration for `recordings` table/' todo.md
    sed -i 's/- \[ \] Create migration for `learning_progress` table/- [x] Create migration for `learning_progress` table/' todo.md

    echo -e "${GREEN}✓ todo.md updated${NC}"
fi

# Summary
echo -e "\n${GREEN}========================================"
echo -e "✅ Phase 1 Setup Complete!"
echo -e "========================================${NC}"
echo
echo "Completed tasks:"
echo "  ✓ Database schema updated with YouTube Shadowing models"
echo "  ✓ Database migration created and applied"
echo "  ✓ Environment variables configured"
echo "  ✓ Dependencies installed"
echo "  ✓ Module directories created"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Update API keys in .env file"
echo "  2. Run 'pnpm module:generate' to create the YouTube Integration module"
echo "  3. Start implementing Phase 2: Core Modules"
echo
echo -e "${YELLOW}Important files to review:${NC}"
echo "  - prisma/schema.prisma (new models)"
echo "  - .env (update API keys)"
echo "  - todo.md (implementation plan)"
echo
echo "Run 'pnpm dev' to start the development server"
