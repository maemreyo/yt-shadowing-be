# Practice Session Module

Manages practice sessions for YouTube shadowing, including state persistence, progress tracking, and session resumption.

## Features

- 🎯 Create and manage practice sessions
- 💾 Real-time state persistence
- ⏸️ Pause and resume functionality
- 📊 Session analytics and progress tracking
- ⚙️ Customizable playback settings
- 📱 Multi-device session synchronization
- 🎯 Daily usage limit enforcement
- 📈 Learning curve visualization

## API Endpoints

### Session Management
- `POST /api/practice-session/create` - Create a new practice session
- `PUT /api/practice-session/:sessionId/state` - Save session state
- `GET /api/practice-session/:sessionId/resume` - Resume a session
- `POST /api/practice-session/:sessionId/end` - End a session
- `GET /api/practice-session/active` - Get user's active session

### History & Analytics
- `GET /api/practice-session/history` - Get session history
- `GET /api/practice-session/:sessionId/analytics` - Get session analytics
- `POST /api/practice-session/export` - Export session data

### Settings & Configuration
- `PATCH /api/practice-session/:sessionId/settings` - Update session settings
- `POST /api/practice-session/batch` - Batch operations on sessions

## DTOs

### CreateSessionDTO
```typescript
{
  videoId: string;          // YouTube video ID
  language: string;         // 2-letter language code
  settings?: {              // Optional session settings
    playbackSpeed: number;  // 0.5 - 2.0
    loopCount: number;      // 1 - 10
    autoPlay: boolean;
    showTranscript: boolean;
    // ... more settings
  };
  startFromSentence?: number;
  endAtSentence?: number;
}
```

### SaveStateDTO
```typescript
{
  currentPosition: number;      // Video position in seconds
  currentSentenceIndex: number; // Current sentence index
  completedSentences: number[]; // Array of completed sentence indices
  difficultSentences: number[]; // Sentences marked as difficult
  recordings: {                 // Recordings mapped by sentence index
    [sentenceIndex: string]: {
      recordingId: string;
      score?: number;
      timestamp: string;
    }
  };
  totalTimeSpent: number;       // Total practice time in seconds
  lastActiveAt: string;         // ISO datetime string
}
```

## Session States

- **ACTIVE** - Session is currently in progress
- **PAUSED** - Session is paused (can be resumed)
- **COMPLETED** - All sentences completed
- **EXPIRED** - Session expired (24 hours of inactivity)
- **ENDED** - Manually ended by user

## Features Breakdown

### 1. Session Creation
- Validates video suitability for learning
- Checks user's daily practice limits
- Initializes session with user preferences
- Caches session data for quick access

### 2. State Persistence
- Real-time saving of practice progress
- Tracks completed and difficult sentences
- Maintains recording associations
- Preserves playback settings

### 3. Session Resumption
- Restore exact position and progress
- Reload user settings
- Check session expiration (24 hours)
- Sync across devices

### 4. Analytics Tracking
- Practice time metrics
- Sentence completion rate
- Recording quality scores
- Learning curve visualization
- Difficulty patterns

### 5. Daily Limits
- Free tier: 30 minutes/day
- Pro tier: 300 minutes/day
- Premium tier: Unlimited
- Automatic reset at midnight (user's timezone)

## Events Emitted

- `practice-session:created` - New session started
- `practice-session:resumed` - Session resumed
- `practice-session:ended` - Session ended
- `practice-session:state-saved` - Progress saved
- `practice-session:settings-updated` - Settings changed
- `practice-session:milestone-reached` - Achievement unlocked
- `practice-session:limit-exceeded` - Daily limit reached

## Middleware

### checkActiveSession
Checks if user has an active session and adds it to the request.

### validateSessionOwnership
Ensures the user owns the session they're trying to access.

### checkDailyLimit
Validates user hasn't exceeded their daily practice limit.

### trackSessionActivity
Updates the last active timestamp for session expiration.

## Configuration

### Environment Variables
```env
# Daily practice limits (minutes)
FREE_TIER_DAILY_MINUTES=30
PRO_TIER_DAILY_MINUTES=300
PREMIUM_TIER_DAILY_MINUTES=-1  # -1 means unlimited

# Session settings
SESSION_CACHE_TTL=3600         # 1 hour
SESSION_EXPIRY_HOURS=24        # 24 hours
MAX_ACTIVE_SESSIONS=1          # Max concurrent sessions per user
```

## Integration Points

### Dependencies
- **YouTube Integration Module** - Video validation and metadata
- **Transcript Module** - Sentence data and timestamps
- **Audio Processing Module** - Recording management (future)
- **Learning Progress Module** - Long-term progress tracking (future)

### Database Models
- `PracticeSession` - Main session records
- `SessionRecording` - Recording associations
- `Video` - Cached video metadata

### Caching Strategy
- Session data cached for 1 hour
- Uses Redis with `practice-session:` prefix
- Automatic cache invalidation on updates

## Usage Examples

### 1. Create a New Session
```bash
curl -X POST http://localhost:3000/api/practice-session/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "dQw4w9WgXcQ",
    "language": "en",
    "settings": {
      "playbackSpeed": 0.75,
      "loopCount": 3
    }
  }'
```

### 2. Save Session State
```bash
curl -X PUT http://localhost:3000/api/practice-session/SESSION_ID/state \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPosition": 45.5,
    "currentSentenceIndex": 3,
    "completedSentences": [0, 1, 2],
    "totalTimeSpent": 180,
    "lastActiveAt": "2025-06-19T10:30:00Z"
  }'
```

### 3. Get Session History
```bash
curl -X GET "http://localhost:3000/api/practice-session/history?limit=10&orderBy=recent" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Error Handling

Common error codes:
- `SESSION_NOT_FOUND` - Session doesn't exist or access denied
- `SESSION_EXPIRED` - Session older than 24 hours
- `SESSION_NOT_ACTIVE` - Trying to save state to inactive session
- `DAILY_LIMIT_EXCEEDED` - User exceeded daily practice limit
- `INVALID_VIDEO` - Video not suitable for learning

## Testing

Run module tests:
```bash
pnpm test src/modules/practice-session
```

Test coverage includes:
- Session lifecycle management
- State persistence and retrieval
- Limit enforcement
- Analytics calculations
- Error scenarios

## Performance Considerations

1. **Caching** - Session data cached to reduce database queries
2. **Batch Operations** - State updates batched where possible
3. **Indexes** - Database indexes on userId, sessionId, status
4. **Cleanup** - Expired sessions cleaned up on module start

## Security

- Session ownership validated on all operations
- Daily limits prevent abuse
- Rate limiting on all endpoints
- Input validation with Zod schemas

## Future Enhancements

- [ ] Multi-language session support
- [ ] Collaborative practice sessions
- [ ] AI-powered difficulty adjustment
- [ ] Session templates/presets
- [ ] Offline session sync
- [ ] Session sharing/export

## Troubleshooting

### Session Won't Resume
- Check if session is within 24-hour window
- Verify session status is ACTIVE
- Ensure video is still available

### State Not Saving
- Check rate limits (100 req/min)
- Verify session ownership
- Check session is active

### Daily Limit Issues
- Limits reset at midnight UTC
- Check user's subscription tier
- Verify environment variables

## Module Statistics

- **API Endpoints**: 10 endpoints
- **DTOs**: 8 data models
- **Events**: 8 event types
- **Middleware**: 4 middleware functions
- **Cache TTL**: 1 hour
- **Session Expiry**: 24 hours
