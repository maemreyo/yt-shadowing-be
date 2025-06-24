# Learning Progress Module

## Overview

The Learning Progress module tracks and analyzes user learning sessions, providing comprehensive analytics, personalized recommendations, and milestone tracking for the YouTube Shadowing feature.

## Features

- **Progress Tracking**: Track completion of individual sentences and overall video progress
- **Analytics**: Comprehensive learning analytics with customizable timeframes
- **Reports**: Generate detailed progress reports in multiple formats
- **Recommendations**: AI-powered personalized video recommendations
- **Streaks**: Track daily practice streaks with milestone rewards
- **Milestones**: Achievement system for motivation

## API Endpoints

### Progress Tracking
- `POST /api/learning-progress/track` - Track progress for a single sentence
- `PUT /api/learning-progress/bulk` - Update progress for multiple sentences

### Analytics & Reports
- `GET /api/learning-progress/analytics` - Get learning analytics
- `GET /api/learning-progress/report` - Generate comprehensive report
- `GET /api/learning-progress/video/:videoId/summary` - Get video-specific summary

### Recommendations & Streaks
- `GET /api/learning-progress/recommendations` - Get personalized recommendations
- `GET /api/learning-progress/streaks` - Get practice streak data
- `GET /api/learning-progress/milestones` - Get achieved milestones

### Health Check
- `GET /api/learning-progress/health` - Module health status

## Usage Examples

### Track Progress
```typescript
// Track completion of a sentence
POST /api/learning-progress/track
{
  "sessionId": "clh1234567890",
  "videoId": "clh0987654321",
  "sentenceIndex": 5,
  "completed": true,
  "difficultyMarked": false,
  "score": 85,
  "timeSpent": 45,
  "recordingId": "clh1122334455"
}
```

### Get Analytics
```typescript
// Get weekly analytics
GET /api/learning-progress/analytics?timeframe=week&metrics[]=totalMinutes&metrics[]=averageScore
```

### Generate Report
```typescript
// Generate monthly progress report
GET /api/learning-progress/report?timeframe=month&includeRecommendations=true&format=json
```

### Get Recommendations
```typescript
// Get personalized video recommendations
GET /api/learning-progress/recommendations?limit=10&difficulty=3&excludeWatched=true
```

## Events

The module emits the following events:

- `learning-progress.tracked` - When progress is tracked
- `learning-progress.milestone.achieved` - When a milestone is reached
- `learning-progress.streak.updated` - When streak changes
- `learning-progress.report.generated` - When a report is generated
- `learning-progress.session.completed` - When a practice session ends

## Milestones

The module tracks achievements for:

### Streak Milestones
- 3-Day Streak
- Week Warrior (7 days)
- Fortnight Fighter (14 days)
- Monthly Master (30 days)
- Persistent Learner (50 days)
- Century Champion (100 days)

### Practice Milestones
- First Steps (10 sentences)
- Making Progress (50 sentences)
- Century Mark (100 sentences)
- Quarter Master (250 sentences)
- Half Thousand (500 sentences)
- Thousand Sentences (1000 sentences)

### Time Milestones
- Half Hour Hero (30 minutes)
- Hour Power (60 minutes)
- Two Hour Champion (120 minutes)
- Five Hour Fighter (300 minutes)
- Ten Hour Titan (600 minutes)
- Twenty Hour Legend (1200 minutes)

## Configuration

The module uses the following configuration:

```typescript
// Cache settings
CACHE_TTL: 3600 // 1 hour

// Rate limits
TRACK_PROGRESS: 300 requests per 15 minutes
BULK_UPDATE: 100 requests per 15 minutes
GENERATE_REPORT: 10 requests per hour
```

## Analytics Metrics

Available metrics for analytics queries:

- `totalSessions` - Number of practice sessions
- `totalMinutes` - Total minutes practiced
- `sentencesCompleted` - Number of sentences completed
- `averageScore` - Average pronunciation score
- `streakDays` - Current practice streak
- `uniqueVideos` - Number of unique videos practiced
- `difficultyDistribution` - Progress by difficulty level
- `progressRate` - Sentences per day rate

## Recommendation Algorithm

The recommendation engine considers:

1. **User Preferences**
   - Preferred difficulty level
   - Average session duration
   - Favorite video topics/tags

2. **Learning History**
   - Previously watched videos
   - Performance on different difficulties
   - Time since last attempt

3. **Scoring Factors**
   - Difficulty match (±10 points per level difference)
   - Duration match (±2 points per minute difference)
   - Tag relevance (+5 points per matching tag)
   - Novelty bonus (+10 points if not watched)

## Database Schema

The module uses the `LearningProgress` model:

```prisma
model LearningProgress {
  id            String   @id @default(cuid())
  userId        String
  videoId       String
  sentenceIndex Int
  completedAt   DateTime?
  difficultyMarked Boolean @default(false)
  attemptsCount    Int     @default(1)
  bestScore        Float?
  timeSpent        Int     // in seconds

  // Relations
  user  User  @relation(fields: [userId], references: [id])
  video Video @relation(fields: [videoId], references: [id])

  // Indexes
  @@unique([userId, videoId, sentenceIndex])
  @@index([userId])
  @@index([videoId])
  @@index([completedAt])
}
```

## Dependencies

- **PrismaService**: Database operations
- **RedisService**: Caching analytics data
- **AnalyticsService**: Event tracking
- **UserService**: User information
- **EventEmitter**: Event-driven communication

## Error Handling

Common errors:
- `404`: Progress record not found
- `400`: Invalid parameters
- `403`: Subscription required for reports
- `429`: Rate limit exceeded

## Testing

Run module tests:
```bash
pnpm test src/modules/learning-progress
```

## Future Enhancements

- [ ] AI-powered learning path generation
- [ ] Social features (leaderboards, challenges)
- [ ] Detailed pronunciation analysis
- [ ] Spaced repetition algorithm
- [ ] Export progress to external platforms
- [ ] Multi-language progress tracking
