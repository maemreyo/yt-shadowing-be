# YouTube Shadowing Backend Modules Strategy

## 🎯 Existing Modules to Leverage

### ✅ **Core Infrastructure (Already Available)**

#### **1. Auth Module**
```typescript
// Perfect for user management
- User registration/login
- JWT tokens for extension ↔ backend
- OAuth integration (Google for YouTube access)
- Session management
```

#### **2. User Module**
```typescript
// User profiles and preferences
- Learning preferences (target language, difficulty)
- Comfort speed settings per user
- Extension settings sync
- User progress overview
```

#### **3. Analytics Module**
```typescript
// Learning progress tracking
- Time spent practicing
- Videos completed
- Difficulty sentences marked
- Speed improvement over time
- Weekly/monthly progress reports
```

#### **4. Billing Module**
```typescript
// Freemium monetization
- Free: 30 minutes/day
- Pro ($5/month): Unlimited + advanced features
- Premium ($15/month): AI-powered feedback
```

#### **5. API Usage Module**
```typescript
// Track external API costs
- YouTube Transcript API usage
- Speech-to-Text API calls
- OpenAI Whisper usage
- Cost monitoring per user
```

## 🔧 New Modules to Create

### **1. Transcript Module**
```bash
pnpm module:generate
# Name: transcript
# Features: api, database, queue, caching, analytics
```

**Core Features:**
```typescript
// src/modules/transcript/transcript.service.ts
class TranscriptService {
  // Get transcript from multiple sources
  async getTranscript(videoId: string, language?: string) {
    // 1. Check cache first
    // 2. Try YouTube Transcript API
    // 3. Fallback to Speech-to-Text APIs
    // 4. Cache result
  }

  // Parse and segment transcript
  async segmentTranscript(transcript: string) {
    // Break into sentences
    // Add timestamps
    // Difficulty scoring
  }

  // Search transcripts
  async searchTranscripts(query: string, userId: string) {
    // Find practice-worthy content
  }
}
```

**API Endpoints:**
```typescript
GET    /api/transcript/:videoId           # Get transcript
POST   /api/transcript/:videoId/process   # Process new video
GET    /api/transcript/search             # Search content
```

### **2. Audio Processing Module**
```bash
pnpm module:generate
# Name: audio-processing
# Features: api, database, queue, caching
```

**Core Features:**
```typescript
// src/modules/audio-processing/audio.service.ts
class AudioProcessingService {
  // Process user recordings
  async processRecording(audioBuffer: Buffer, userId: string) {
    // Convert format (WebM → WAV)
    // Generate waveform data
    // Speech-to-text transcription
    // Store in cloud storage
  }

  // Compare with original
  async compareAudio(userRecording: string, originalSegment: string) {
    // Pronunciation analysis
    // Timing comparison
    // Confidence scoring
  }

  // Generate waveform data
  async generateWaveform(audioBuffer: Buffer) {
    // FFmpeg processing
    // Return visualization data
  }
}
```

**API Endpoints:**
```typescript
POST   /api/audio/upload                 # Upload recording
GET    /api/audio/:recordingId/waveform  # Get waveform data
POST   /api/audio/compare                # Compare recordings
DELETE /api/audio/:recordingId           # Delete recording
```

### **3. Learning Progress Module**
```bash
pnpm module:generate
# Name: learning-progress
# Features: api, database, events, analytics
```

**Core Features:**
```typescript
// src/modules/learning-progress/progress.service.ts
class LearningProgressService {
  // Track practice sessions
  async createSession(userId: string, videoId: string) {
    // Start new practice session
    // Track start time, video, settings
  }

  // Update progress
  async updateProgress(sessionId: string, data: ProgressData) {
    // Sentences completed
    // Difficult sentences marked
    // Speed improvements
    // Time spent per sentence
  }

  // Get learning analytics
  async getUserAnalytics(userId: string, timeframe: string) {
    // Progress over time
    // Strength/weakness analysis
    // Recommended content
  }
}
```

**API Endpoints:**
```typescript
POST   /api/progress/session             # Start session
PUT    /api/progress/session/:sessionId  # Update progress
GET    /api/progress/analytics           # Get analytics
GET    /api/progress/recommendations     # Get recommendations
```

### **4. YouTube Integration Module**
```bash
pnpm module:generate
# Name: youtube-integration
# Features: api, caching, ratelimit
```

**Core Features:**
```typescript
// src/modules/youtube-integration/youtube.service.ts
class YouTubeIntegrationService {
  // Get video metadata
  async getVideoInfo(videoId: string) {
    // Title, duration, language
    // Check if suitable for learning
    // Cache metadata
  }

  // Get video captions
  async getCaptions(videoId: string, language?: string) {
    // Available caption tracks
    // Download caption files
    // Parse timing information
  }

  // Search learning content
  async searchLearningVideos(query: string, language: string) {
    // Find suitable videos
    // Filter by duration, language
    // Quality scoring
  }
}
```

**API Endpoints:**
```typescript
GET    /api/youtube/video/:videoId       # Get video info
GET    /api/youtube/captions/:videoId    # Get captions
GET    /api/youtube/search               # Search content
```

### **5. Practice Session Module**
```bash
pnpm module:generate
# Name: practice-session
# Features: api, database, events
```

**Core Features:**
```typescript
// src/modules/practice-session/session.service.ts
class PracticeSessionService {
  // Manage practice sessions
  async createSession(userId: string, videoId: string, settings: SessionSettings) {
    // Initialize session
    // Set speed, loop count preferences
    // Track start time
  }

  // Save session state
  async saveState(sessionId: string, state: SessionState) {
    // Current position
    // Marked sentences
    // Recordings made
    // Settings changes
  }

  // Resume session
  async resumeSession(sessionId: string) {
    // Restore previous state
    // Continue from last position
  }
}
```

**API Endpoints:**
```typescript
POST   /api/sessions                     # Create session
PUT    /api/sessions/:sessionId/state    # Save state
GET    /api/sessions/:sessionId/resume   # Resume session
GET    /api/sessions/history             # Session history
```

## 🔧 Module Configuration

### **Environment Variables**
```env
# YouTube Integration
YOUTUBE_API_KEY=your-youtube-api-key
YOUTUBE_QUOTA_LIMIT=10000

# Speech-to-Text Services
OPENAI_WHISPER_API_KEY=your-whisper-key
ASSEMBLYAI_API_KEY=your-assemblyai-key
GOOGLE_SPEECH_API_KEY=your-google-speech-key

# Audio Storage
CLOUDFLARE_R2_BUCKET=shadowing-audio
CLOUDFLARE_R2_ACCESS_KEY=your-r2-key
CLOUDFLARE_R2_SECRET_KEY=your-r2-secret

# Feature Limits
FREE_TIER_DAILY_MINUTES=30
PRO_TIER_DAILY_MINUTES=unlimited
RECORDING_MAX_DURATION=300  # 5 minutes
```

### **Billing Integration**
```typescript
// Subscription plans for shadowing features
const SHADOWING_PLANS = {
  free: {
    dailyMinutes: 30,
    maxRecordings: 10,
    audioQuality: 'standard',
    features: ['basic-transcript', 'speed-control']
  },
  pro: {
    dailyMinutes: 'unlimited',
    maxRecordings: 'unlimited',
    audioQuality: 'high',
    features: ['ai-transcript', 'pronunciation-analysis', 'progress-analytics']
  },
  premium: {
    dailyMinutes: 'unlimited',
    maxRecordings: 'unlimited',
    audioQuality: 'studio',
    features: ['ai-feedback', 'custom-content', 'advanced-analytics']
  }
};
```

## 📊 Database Schema Extensions

### **Additional Tables Needed**
```sql
-- Video metadata and transcripts
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  youtube_video_id VARCHAR(20) UNIQUE,
  title TEXT,
  duration INTEGER,
  language VARCHAR(10),
  difficulty_level INTEGER,
  transcript_available BOOLEAN,
  created_at TIMESTAMP
);

-- User practice sessions
CREATE TABLE practice_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  video_id UUID REFERENCES videos(id),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  total_duration INTEGER,
  settings JSONB,
  progress JSONB
);

-- User recordings
CREATE TABLE recordings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  session_id UUID REFERENCES practice_sessions(id),
  sentence_start_time FLOAT,
  sentence_end_time FLOAT,
  audio_url TEXT,
  waveform_data JSONB,
  transcription TEXT,
  quality_score FLOAT
);

-- Learning progress tracking
CREATE TABLE learning_progress (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  video_id UUID REFERENCES videos(id),
  sentence_index INTEGER,
  completed_at TIMESTAMP,
  difficulty_marked BOOLEAN,
  attempts_count INTEGER,
  best_score FLOAT
);
```

## 🚀 Development Priority

### **Phase 1: MVP (Weeks 1-2)**
1. ✅ Auth + User modules (existing)
2. 🔧 Transcript module (basic YouTube API)
3. 🔧 Practice Session module (basic state management)

### **Phase 2: Core Features (Weeks 3-4)**
4. 🔧 Audio Processing module (recording + storage)
5. 🔧 Learning Progress module (analytics)
6. 🔧 YouTube Integration module (enhanced search)

### **Phase 3: Premium Features (Weeks 5-6)**
7. ✅ Billing module integration (subscription plans)
8. 🔧 Advanced audio processing (AI feedback)
9. ✅ Analytics module (detailed reports)

## 💰 Cost Optimization Strategy

### **Free Tier (Smart Limits)**
```typescript
// Efficient resource usage
const freetierLimits = {
  dailyTranscriptCalls: 50,        // $1.85/day max
  audioStoragePerUser: '100MB',    // $0.0015/user/month
  dailyProcessingMinutes: 30,      // Reasonable limit
  maxRecordingsStored: 10          // Cleanup old recordings
};
```

### **API Cost Management**
```typescript
// Intelligent fallback strategy
async getTranscript(videoId: string) {
  // 1. Check cache (free)
  // 2. YouTube API (free, limited)
  // 3. Whisper API ($0.006/minute) - most accurate
  // 4. AssemblyAI ($0.37/hour) - good quality
  // 5. Google STT ($0.024/minute) - fallback
}
```

## 📈 Success Metrics

### **User Engagement**
- Daily active users in extension
- Average session duration
- Sentences completed per session
- Retention rate (7-day, 30-day)

### **Learning Effectiveness**
- Speed improvement over time
- Pronunciation accuracy scores
- User-reported confidence levels
- Video completion rates

### **Business Metrics**
- Free → Pro conversion rate
- Monthly recurring revenue
- Customer acquisition cost
- Lifetime value per user

**Bottom Line:** Leverage existing SaaS infrastructure (60% done) + build 5 specialized modules (40% new work) = Complete YouTube shadowing platform! 🎯







# Quick Implementation Commands for YouTube Shadowing Backend

# 1. Generate Transcript Module
pnpm module:generate
# When prompted:
# Module name: transcript
# Display name: Transcript Processing
# Description: Handle YouTube transcripts and speech-to-text processing
# Features: ✓ RESTful API endpoints, ✓ Database models, ✓ Background jobs, ✓ Caching layer, ✓ Analytics tracking
# Dependencies: ✓ User, ✓ Analytics, ✓ API Usage

# 2. Generate Audio Processing Module
pnpm module:generate
# When prompted:
# Module name: audio-processing
# Display name: Audio Processing
# Description: Handle voice recordings, waveform generation, and audio comparison
# Features: ✓ RESTful API endpoints, ✓ Database models, ✓ Background jobs, ✓ Caching layer
# Dependencies: ✓ User, ✓ Analytics

# 3. Generate Learning Progress Module
pnpm module:generate
# When prompted:
# Module name: learning-progress
# Display name: Learning Progress
# Description: Track learning sessions, progress analytics, and recommendations
# Features: ✓ RESTful API endpoints, ✓ Database models, ✓ Event system, ✓ Analytics tracking
# Dependencies: ✓ User, ✓ Analytics

# 4. Generate YouTube Integration Module
pnpm module:generate
# When prompted:
# Module name: youtube-integration
# Display name: YouTube Integration
# Description: YouTube API integration, video metadata, and caption processing
# Features: ✓ RESTful API endpoints, ✓ Caching layer, ✓ Rate limiting
# Dependencies: ✓ User, ✓ API Usage

# 5. Generate Practice Session Module
pnpm module:generate
# When prompted:
# Module name: practice-session
# Display name: Practice Session
# Description: Manage practice sessions, state persistence, and resume functionality
# Features: ✓ RESTful API endpoints, ✓ Database models, ✓ Event system
# Dependencies: ✓ User, ✓ Analytics

# 6. Update Environment Variables
echo "
# YouTube Shadowing Configuration
YOUTUBE_API_KEY=your-youtube-api-key
OPENAI_WHISPER_API_KEY=your-whisper-key
CLOUDFLARE_R2_BUCKET=shadowing-audio
FREE_TIER_DAILY_MINUTES=30
" >> .env

# 7. Update Database Schema
npx prisma migrate dev --name add-shadowing-tables

# 8. Enable New Modules in Environment
echo "
# New Modules
TRANSCRIPT_MODULE_ENABLED=true
AUDIO_PROCESSING_MODULE_ENABLED=true
LEARNING_PROGRESS_MODULE_ENABLED=true
YOUTUBE_INTEGRATION_MODULE_ENABLED=true
PRACTICE_SESSION_MODULE_ENABLED=true
" >> .env

# 9. Install Additional Dependencies
npm install fluent-ffmpeg wavesurfer.js assemblyai openai-whisper
npm install @google-cloud/speech youtube-transcript googleapis

# 10. Start Development
make dev

# 11. Test New Modules
curl http://localhost:3000/api/transcript/health
curl http://localhost:3000/api/audio-processing/health
curl http://localhost:3000/api/learning-progress/health
curl http://localhost:3000/api/youtube-integration/health
curl http://localhost:3000/api/practice-session/health
