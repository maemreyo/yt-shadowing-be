# YouTube Shadowing - System Integration Guide

## 🔗 Integration với Billing Module

### Update Subscription Plans (`billing.service.ts`)
```typescript
// Add to existing subscription features
export const SHADOWING_FEATURES = {
  free: {
    dailyMinutes: 30,
    maxRecordingsPerSession: 5,
    maxStoredRecordings: 10,
    audioQuality: 'standard', // 128kbps
    features: ['basic-transcript', 'speed-control', 'loop-3x']
  },
  pro: {
    dailyMinutes: 300,
    maxRecordingsPerSession: -1, // unlimited
    maxStoredRecordings: 100,
    audioQuality: 'high', // 256kbps
    features: ['ai-transcript', 'pronunciation-analysis', 'speed-control', 'loop-10x', 'progress-analytics']
  },
  premium: {
    dailyMinutes: -1, // unlimited
    maxRecordingsPerSession: -1,
    maxStoredRecordings: -1,
    audioQuality: 'studio', // 320kbps
    features: ['ai-feedback', 'custom-content', 'advanced-analytics', 'export-data', 'api-access']
  }
};

// Usage tracking method
async function trackShadowingUsage(userId: string, minutes: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscriptions: { where: { status: 'ACTIVE' } } }
  });

  const plan = user.subscriptions[0]?.metadata?.plan || 'free';
  const limits = SHADOWING_FEATURES[plan];

  // Check daily limit
  const todayUsage = await prisma.usageRecord.aggregate({
    where: {
      subscriptionId: user.subscriptions[0]?.id,
      action: 'shadowing_minutes',
      timestamp: { gte: startOfDay(new Date()) }
    },
    _sum: { quantity: true }
  });

  if (limits.dailyMinutes > 0 && todayUsage._sum.quantity + minutes > limits.dailyMinutes) {
    throw new Error('Daily shadowing limit exceeded');
  }

  // Record usage
  await prisma.usageRecord.create({
    data: {
      subscriptionId: user.subscriptions[0].id,
      quantity: minutes,
      action: 'shadowing_minutes',
      timestamp: new Date()
    }
  });
}
```

## 🔐 Integration với Auth Module

### Middleware cho Practice Sessions
```typescript
// src/modules/practice-session/practice-session.middleware.ts
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';
import { checkSubscription } from '@shared/middleware/subscription.middleware';

export const practiceSessionMiddleware = [
  authMiddleware,
  checkSubscription,
  async (req, res) => {
    // Check user's daily limit
    const usage = await getUserDailyUsage(req.user.id);
    const limits = await getUserLimits(req.user.id);

    if (usage.minutes >= limits.dailyMinutes && limits.dailyMinutes > 0) {
      throw new ForbiddenException('Daily practice limit exceeded. Upgrade to Pro for more minutes!');
    }
  }
];
```

## 📊 Integration với Analytics Module

### Custom Analytics Events
```typescript
// src/modules/learning-progress/learning-progress.events.ts
export enum LearningProgressEvents {
  SESSION_STARTED = 'learning.session.started',
  SESSION_COMPLETED = 'learning.session.completed',
  SENTENCE_COMPLETED = 'learning.sentence.completed',
  RECORDING_CREATED = 'learning.recording.created',
  MILESTONE_ACHIEVED = 'learning.milestone.achieved',
  STREAK_UPDATED = 'learning.streak.updated'
}

// Event handlers
@OnEvent(LearningProgressEvents.SESSION_COMPLETED)
async handleSessionCompleted(payload: SessionCompletedPayload) {
  // Track in analytics
  await analyticsService.track({
    userId: payload.userId,
    event: 'session_completed',
    properties: {
      videoId: payload.videoId,
      duration: payload.duration,
      sentencesCompleted: payload.sentencesCompleted,
      averageScore: payload.averageScore
    }
  });

  // Check for achievements
  await checkAchievements(payload.userId);
}
```

## 🔔 Integration với Notification Module

### Notification Types
```typescript
// Add to notification types
export const SHADOWING_NOTIFICATIONS = {
  DAILY_REMINDER: {
    title: 'Time to practice!',
    body: 'Keep your {{streak}} day streak going! 🔥'
  },
  MILESTONE_ACHIEVED: {
    title: 'Achievement Unlocked! 🎉',
    body: 'You\'ve completed {{count}} sentences!'
  },
  WEEKLY_REPORT: {
    title: 'Your Weekly Progress',
    body: 'You practiced {{minutes}} minutes this week!'
  },
  SUBSCRIPTION_LIMIT: {
    title: 'Limit Reached',
    body: 'You\'ve used all your free minutes today. Upgrade to Pro for unlimited practice!'
  }
};
```

## 🎫 Integration với Support Module

### Support Ticket Categories
```typescript
// Add YouTube Shadowing categories
export const SHADOWING_TICKET_CATEGORIES = {
  TRANSCRIPT_ISSUE: 'transcript_issue',
  RECORDING_PROBLEM: 'recording_problem',
  VIDEO_NOT_WORKING: 'video_not_working',
  SYNC_ISSUE: 'sync_issue',
  FEATURE_REQUEST: 'feature_request'
};

// Auto-responses for common issues
export const SHADOWING_AUTO_RESPONSES = {
  [SHADOWING_TICKET_CATEGORIES.RECORDING_PROBLEM]: `
    Common recording issues:
    1. Make sure you've allowed microphone access
    2. Check your browser supports WebRTC
    3. Try using Chrome or Firefox for best compatibility
    4. Clear your browser cache and try again
  `,
  [SHADOWING_TICKET_CATEGORIES.TRANSCRIPT_ISSUE]: `
    If transcripts are not showing:
    1. The video might not have captions available
    2. Try refreshing the page
    3. Check if the video is age-restricted
    4. Report the specific video ID for investigation
  `
};
```

## 🔄 Integration với Webhooks Module

### Webhook Events
```typescript
// src/modules/webhooks/shadowing.webhooks.ts
export const SHADOWING_WEBHOOK_EVENTS = {
  'session.started': {
    description: 'Fired when a practice session starts',
    payload: {
      sessionId: 'string',
      userId: 'string',
      videoId: 'string',
      timestamp: 'datetime'
    }
  },
  'recording.completed': {
    description: 'Fired when a recording is processed',
    payload: {
      recordingId: 'string',
      sessionId: 'string',
      scores: {
        pronunciation: 'number',
        fluency: 'number',
        overall: 'number'
      }
    }
  },
  'milestone.achieved': {
    description: 'Fired when user reaches a milestone',
    payload: {
      userId: 'string',
      milestone: 'string',
      value: 'number'
    }
  }
};
```

## 🛡️ Security Considerations

### File Upload Security
```typescript
// Audio upload validation
export const AUDIO_UPLOAD_CONFIG = {
  maxSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: ['audio/webm', 'audio/wav', 'audio/mp3'],
  virusScan: true,

  validate: async (file: Buffer, mimeType: string) => {
    // Check file signature
    const fileSignature = file.slice(0, 4).toString('hex');
    const validSignatures = {
      'audio/webm': '1a45dfa3',
      'audio/wav': '52494646',
      'audio/mp3': ['494433', 'fffb']
    };

    // Validate audio duration
    const duration = await getAudioDuration(file);
    if (duration > 300) { // 5 minutes max
      throw new Error('Recording too long');
    }
  }
};
```

### Rate Limiting
```typescript
// API rate limits for shadowing endpoints
export const SHADOWING_RATE_LIMITS = {
  '/api/transcript/:videoId': {
    max: 100,
    window: '1h',
    keyGenerator: (req) => `${req.user.id}:transcript`
  },
  '/api/audio/upload': {
    max: 60,
    window: '1h',
    keyGenerator: (req) => `${req.user.id}:upload`
  },
  '/api/youtube/search': {
    max: 30,
    window: '15m',
    keyGenerator: (req) => `${req.user.id}:search`
  }
};
```

## 🚀 Performance Optimization

### Caching Strategy
```typescript
// Redis caching for frequently accessed data
export const SHADOWING_CACHE_CONFIG = {
  transcripts: {
    key: (videoId: string) => `transcript:${videoId}`,
    ttl: 7 * 24 * 60 * 60, // 7 days
  },
  videoMetadata: {
    key: (videoId: string) => `video:meta:${videoId}`,
    ttl: 24 * 60 * 60, // 1 day
  },
  userProgress: {
    key: (userId: string, videoId: string) => `progress:${userId}:${videoId}`,
    ttl: 60 * 60, // 1 hour
  },
  dailyUsage: {
    key: (userId: string) => `usage:${userId}:${format(new Date(), 'yyyy-MM-dd')}`,
    ttl: 25 * 60 * 60, // 25 hours
  }
};
```

### Background Jobs
```typescript
// Queue configuration for audio processing
export const AUDIO_PROCESSING_QUEUE = {
  name: 'audio-processing',
  concurrency: 5,
  jobs: {
    processRecording: {
      priority: 1,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    },
    generateWaveform: {
      priority: 2,
      removeOnComplete: true
    },
    cleanupOldRecordings: {
      priority: 3,
      repeat: {
        cron: '0 2 * * *' // Daily at 2 AM
      }
    }
  }
};
```
