# YouTube Shadowing Module Implementation Guide

## 📦 1. Transcript Module

### Generate Module
```bash
pnpm module:generate
# Name: transcript
# Display name: Transcript Processing
# Description: Handle YouTube transcripts and speech-to-text processing
# Features: ✓ API, ✓ Database, ✓ Background jobs, ✓ Caching, ✓ Analytics
# Dependencies: ✓ User, ✓ Analytics, ✓ API Usage
```

### DTOs Implementation (`transcript.dto.ts`)
```typescript
// src/modules/transcript/transcript.dto.ts
import { z } from 'zod';

export class GetTranscriptDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID'),
    language: z.string().length(2).optional().default('en'),
    forceRefresh: z.boolean().optional().default(false)
  });
}

export class ProcessTranscriptDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    language: z.string().length(2).default('en'),
    source: z.enum(['youtube', 'whisper', 'manual']).default('youtube'),
    sentences: z.array(z.object({
      text: z.string(),
      startTime: z.number(),
      endTime: z.number()
    })).optional()
  });
}

export class SearchTranscriptDTO {
  static schema = z.object({
    query: z.string().min(2).max(100),
    language: z.string().length(2).optional(),
    difficultyLevel: z.number().min(1).max(5).optional(),
    limit: z.number().min(1).max(50).default(20),
    offset: z.number().min(0).default(0)
  });
}

export class TranscriptSegmentDTO {
  static schema = z.object({
    sentences: z.array(z.object({
      index: z.number(),
      text: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      difficulty: z.number().min(1).max(5).optional()
    }))
  });
}
```

### Service Methods (`transcript.service.ts`)
```typescript
class TranscriptService {
  // Core methods
  async getTranscript(videoId: string, language: string = 'en'): Promise<Transcript>
  async processYouTubeTranscript(videoId: string): Promise<void>
  async generateTranscriptFromAudio(audioUrl: string, service: 'whisper' | 'google'): Promise<TranscriptSegmentDTO>
  async segmentTranscript(text: string, timestamps?: Array<{start: number, end: number}>): Promise<TranscriptSegmentDTO>
  async searchTranscripts(query: string, filters: SearchFilters): Promise<PaginatedResult<Video>>
  async calculateDifficulty(text: string): Promise<number>

  // Cache management
  async cacheTranscript(videoId: string, transcript: Transcript): Promise<void>
  async getCachedTranscript(videoId: string): Promise<Transcript | null>
}
```

## 📦 2. Audio Processing Module

### Generate Module
```bash
pnpm module:generate
# Name: audio-processing
# Display name: Audio Processing
# Description: Handle voice recordings, waveform generation, and audio comparison
# Features: ✓ API, ✓ Database, ✓ Background jobs, ✓ Caching
# Dependencies: ✓ User, ✓ Analytics
```

### DTOs Implementation (`audio-processing.dto.ts`)
```typescript
// src/modules/audio-processing/audio-processing.dto.ts
import { z } from 'zod';

export class UploadRecordingDTO {
  static schema = z.object({
    sessionId: z.string(),
    sentenceIndex: z.number().min(0),
    sentenceStartTime: z.number(),
    sentenceEndTime: z.number(),
    audioData: z.string(), // Base64 encoded audio
    mimeType: z.enum(['audio/webm', 'audio/wav', 'audio/mp3']).default('audio/webm')
  });
}

export class CompareAudioDTO {
  static schema = z.object({
    userRecordingId: z.string(),
    originalAudioUrl: z.string().url().optional(),
    originalText: z.string(),
    analysisType: z.array(z.enum(['pronunciation', 'fluency', 'timing', 'emotion'])).default(['pronunciation', 'fluency'])
  });
}

export class WaveformRequestDTO {
  static schema = z.object({
    audioUrl: z.string().url(),
    resolution: z.number().min(100).max(5000).default(1000),
    format: z.enum(['json', 'svg']).default('json')
  });
}

export class AudioAnalysisResultDTO {
  pronunciationScore: number; // 0-100
  fluencyScore: number; // 0-100
  timingAccuracy: number; // 0-100
  overallScore: number; // 0-100

  issues?: Array<{
    word: string;
    issue: string;
    suggestion: string;
    timestamp: number;
  }>;

  waveformComparison?: {
    user: number[];
    original: number[];
  };
}
```

### Service Methods (`audio-processing.service.ts`)
```typescript
class AudioProcessingService {
  // Core audio processing
  async processRecording(audioBuffer: Buffer, metadata: RecordingMetadata): Promise<Recording>
  async convertAudioFormat(input: Buffer, fromFormat: string, toFormat: string): Promise<Buffer>
  async generateWaveform(audioBuffer: Buffer, resolution: number): Promise<number[]>
  async extractAudioFeatures(audioBuffer: Buffer): Promise<AudioFeatures>

  // Storage
  async uploadToCloudflare(audioBuffer: Buffer, filename: string): Promise<string>
  async deleteFromCloudflare(audioUrl: string): Promise<void>

  // Analysis
  async compareAudio(userRecording: Recording, originalText: string): Promise<AudioAnalysisResultDTO>
  async transcribeAudio(audioBuffer: Buffer, language: string): Promise<string>
  async analyzePronunciation(audioBuffer: Buffer, expectedText: string): Promise<PronunciationAnalysis>

  // Cleanup
  async cleanupOldRecordings(userId: string, daysToKeep: number): Promise<number>
}
```

## 📦 3. Learning Progress Module

### Generate Module
```bash
pnpm module:generate
# Name: learning-progress
# Display name: Learning Progress
# Description: Track learning sessions, progress analytics, and recommendations
# Features: ✓ API, ✓ Database, ✓ Events, ✓ Analytics
# Dependencies: ✓ User, ✓ Analytics
```

### DTOs Implementation (`learning-progress.dto.ts`)
```typescript
// src/modules/learning-progress/learning-progress.dto.ts
import { z } from 'zod';

export class CreateSessionDTO {
  static schema = z.object({
    videoId: z.string(),
    settings: z.object({
      playbackSpeed: z.number().min(0.5).max(2).default(1),
      loopCount: z.number().min(1).max(10).default(3),
      autoPlay: z.boolean().default(true),
      showTranscript: z.boolean().default(true),
      highlightWords: z.boolean().default(false)
    }).optional()
  });
}

export class UpdateProgressDTO {
  static schema = z.object({
    sessionId: z.string(),
    progress: z.object({
      currentPosition: z.number().min(0),
      completedSentences: z.array(z.number()),
      difficultSentences: z.array(z.number()).optional(),
      recordings: z.array(z.object({
        sentenceIndex: z.number(),
        recordingId: z.string(),
        score: z.number().min(0).max(100).optional()
      })).optional()
    }),
    timeSpent: z.number().min(0)
  });
}

export class AnalyticsQueryDTO {
  static schema = z.object({
    timeframe: z.enum(['day', 'week', 'month', 'year', 'all']).default('week'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional(),
    metrics: z.array(z.enum([
      'totalSessions',
      'totalMinutes',
      'sentencesCompleted',
      'averageScore',
      'streakDays'
    ])).optional()
  });
}

export class ProgressReportDTO {
  userId: string;
  timeframe: string;

  totalSessions: number;
  totalMinutes: number;
  sentencesCompleted: number;
  uniqueVideos: number;

  averageScore: number;
  bestScore: number;
  improvement: number; // percentage

  streakDays: number;
  lastPracticeDate: Date;

  topVideos: Array<{
    video: Video;
    sessionsCount: number;
    progress: number; // percentage
  }>;

  weakAreas: Array<{
    type: 'pronunciation' | 'fluency' | 'timing';
    score: number;
    suggestion: string;
  }>;
}
```

## 📦 4. YouTube Integration Module

### Generate Module
```bash
pnpm module:generate
# Name: youtube-integration
# Display name: YouTube Integration
# Description: YouTube API integration, video metadata, and caption processing
# Features: ✓ API, ✓ Caching, ✓ Rate limiting
# Dependencies: ✓ User, ✓ API Usage
```

### DTOs Implementation (`youtube-integration.dto.ts`)
```typescript
// src/modules/youtube-integration/youtube-integration.dto.ts
import { z } from 'zod';

export class VideoSearchDTO {
  static schema = z.object({
    query: z.string().min(2).max(100),
    language: z.string().length(2).default('en'),
    duration: z.enum(['short', 'medium', 'long']).optional(), // <4min, 4-20min, >20min
    maxResults: z.number().min(1).max(50).default(20),
    pageToken: z.string().optional(),
    orderBy: z.enum(['relevance', 'viewCount', 'date', 'rating']).default('relevance')
  });
}

export class VideoInfoDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    includeCaptions: z.boolean().default(true),
    includeMetadata: z.boolean().default(true)
  });
}

export class CaptionRequestDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    language: z.string().length(2).default('en'),
    format: z.enum(['srt', 'vtt', 'json']).default('json')
  });
}

export class VideoMetadataDTO {
  videoId: string;
  title: string;
  description: string;
  duration: number; // seconds
  channelId: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: Date;
  viewCount: number;
  tags: string[];

  availableCaptions: Array<{
    language: string;
    name: string;
    isAutoGenerated: boolean;
  }>;

  suitabilityScore: number; // 0-100 for language learning
  difficultyLevel: number; // 1-5
}
```

## 📦 5. Practice Session Module

### Generate Module
```bash
pnpm module:generate
# Name: practice-session
# Display name: Practice Session
# Description: Manage practice sessions, state persistence, and resume functionality
# Features: ✓ API, ✓ Database, ✓ Events
# Dependencies: ✓ User, ✓ Analytics
```

### DTOs Implementation (`practice-session.dto.ts`)
```typescript
// src/modules/practice-session/practice-session.dto.ts
import { z } from 'zod';

export class SessionSettingsDTO {
  static schema = z.object({
    playbackSpeed: z.number().min(0.5).max(2).default(1),
    loopCount: z.number().min(1).max(10).default(3),
    autoPlay: z.boolean().default(true),
    showTranscript: z.boolean().default(true),
    highlightWords: z.boolean().default(false),
    recordingEnabled: z.boolean().default(true),
    autoRecordAfterLoop: z.boolean().default(false)
  });
}

export class SaveStateDTO {
  static schema = z.object({
    currentPosition: z.number().min(0),
    currentSentenceIndex: z.number().min(0),
    completedSentences: z.array(z.number()),
    difficultSentences: z.array(z.number()),
    recordings: z.record(z.string()), // sentenceIndex -> recordingId
    settings: SessionSettingsDTO.schema.optional()
  });
}

export class SessionHistoryQueryDTO {
  static schema = z.object({
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
    videoId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    orderBy: z.enum(['recent', 'duration', 'progress']).default('recent')
  });
}

export class SessionSummaryDTO {
  sessionId: string;
  video: {
    id: string;
    title: string;
    thumbnailUrl: string;
  };

  startTime: Date;
  endTime?: Date;
  duration: number; // seconds

  progress: {
    completedSentences: number;
    totalSentences: number;
    percentage: number;
  };

  recordings: {
    count: number;
    averageScore?: number;
  };

  canResume: boolean;
}
```

## 🔧 Environment Variables Needed

```env
# YouTube API
YOUTUBE_API_KEY=your-youtube-api-key
YOUTUBE_QUOTA_LIMIT=10000

# Speech-to-Text Services
OPENAI_WHISPER_API_KEY=your-whisper-key
ASSEMBLYAI_API_KEY=your-assemblyai-key  # Optional
GOOGLE_SPEECH_API_KEY=your-google-speech-key  # Optional

# Audio Storage (Cloudflare R2)
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY=your-access-key
CLOUDFLARE_R2_SECRET_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=shadowing-audio
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Feature Limits
FREE_TIER_DAILY_MINUTES=30
PRO_TIER_DAILY_MINUTES=300
PREMIUM_TIER_DAILY_MINUTES=-1  # unlimited
RECORDING_MAX_DURATION=300  # 5 minutes
RECORDING_MAX_SIZE_MB=50

# Module Toggles
TRANSCRIPT_MODULE_ENABLED=true
AUDIO_PROCESSING_MODULE_ENABLED=true
LEARNING_PROGRESS_MODULE_ENABLED=true
YOUTUBE_INTEGRATION_MODULE_ENABLED=true
PRACTICE_SESSION_MODULE_ENABLED=true
```

## 📝 Implementation Order

1. **YouTube Integration Module** - Get video data first
2. **Transcript Module** - Process and store transcripts
3. **Practice Session Module** - Core practice functionality
4. **Audio Processing Module** - Handle recordings
5. **Learning Progress Module** - Analytics and tracking
