`# Transcript Module

This module handles video transcript processing, speech-to-text conversion, and transcript analysis for language learning.

## Features

- Fetch and process YouTube video transcripts
- Segment transcripts into practice-ready sentences
- Speech-to-text conversion using multiple services
- Transcript search and filtering
- Difficulty analysis and learning recommendations
- Export transcripts in multiple formats
- Batch processing support

## API Endpoints

### Get Transcript
```
GET /api/transcript/:videoId
Query Parameters:
  - language: string (default: 'en')
  - forceRefresh: boolean (default: false)
  - includeTimestamps: boolean (default: true)
  - includeWordLevel: boolean (default: false)

Response:
{
  "success": true,
  "data": {
    "videoId": "abc123",
    "language": "en",
    "sentences": [...],
    "fullText": "...",
    "wordCount": 500,
    "duration": 300,
    "difficulty": 3
  }
}
```

### Process Transcript
```
POST /api/transcript/:videoId/process
Body:
{
  "language": "en",
  "source": "youtube",
  "sentences": [...],
  "autoSegment": true,
  "saveToDatabase": true
}

Response:
{
  "success": true,
  "data": {
    "videoId": "abc123",
    "language": "en",
    "sentences": [...],
    "confidence": 0.95
  }
}
```

### Search Transcripts
```
GET /api/transcript/search
Query Parameters:
  - query: string (required)
  - language: string
  - difficultyLevel: number (1-5)
  - minDuration: number
  - maxDuration: number
  - limit: number (default: 20)
  - offset: number (default: 0)
  - sortBy: string (relevance|difficulty|duration|date)

Response:
{
  "success": true,
  "data": {
    "results": [...],
    "total": 50,
    "query": "learn english"
  }
}
```

### Speech to Text
```
POST /api/transcript/speech-to-text
Body:
{
  "audioUrl": "https://...",
  "audioData": "base64...",
  "language": "en",
  "service": "auto",
  "enhanceAccuracy": true
}

Response:
{
  "success": true,
  "data": {
    "text": "Hello world",
    "language": "en",
    "service": "whisper"
  }
}
```

### Analyze Transcript
```
GET /api/transcript/:videoId/analysis
Query Parameters:
  - language: string (default: 'en')

Response:
{
  "success": true,
  "data": {
    "videoId": "abc123",
    "totalDuration": 300,
    "totalWords": 500,
    "averageSpeakingRate": 150,
    "overallDifficulty": 3,
    "vocabularyLevel": "B1",
    "suitableForLevels": ["A2", "B1", "B2"],
    "practiceRecommendations": [...]
  }
}
```

## Configuration

Optional environment variables for speech-to-text services:
```env
# OpenAI Whisper (recommended)
OPENAI_WHISPER_API_KEY=your-key

# Google Speech-to-Text
GOOGLE_SPEECH_API_KEY=your-key

# AssemblyAI
ASSEMBLYAI_API_KEY=your-key
```

## Caching

Transcripts are cached for 7 days to reduce API calls:
- Individual transcripts: 7 days
- Search results: 1 hour

## Speech-to-Text Services

The module supports multiple STT services with automatic fallback:
1. **OpenAI Whisper** - Most accurate, supports 50+ languages
2. **Google Speech-to-Text** - Good accuracy, real-time support
3. **AssemblyAI** - Advanced features like speaker diarization

## Difficulty Analysis

Transcripts are analyzed for difficulty based on:
- Average sentence length
- Word complexity
- Speaking rate
- Vocabulary level

## Rate Limits

- Get transcript: 100 requests/15 minutes
- Process transcript: 20 requests/15 minutes
- Speech-to-text: 30 requests/hour
- Batch processing: 5 requests/hour

## Error Handling

Common errors:
- 404: Transcript not found
- 400: Invalid video ID or parameters
- 403: Subscription required for premium features
- 429: Rate limit exceeded

## Dependencies

- YouTube Integration module
- Redis for caching
- OpenAI SDK (optional)
- Google Cloud Speech (optional)
- AssemblyAI SDK (optional)

## Testing

Run module tests:
```bash
pnpm test src/modules/transcript
```

## Future Enhancements

- [ ] Real-time transcript synchronization
- [ ] Multi-language translation
- [ ] Collaborative transcript editing
- [ ] Advanced NLP analysis
- [ ] Custom vocabulary lists
`

// ============================================







# Transcript Module - Implementation Summary

## ✅ What We've Completed

### 1. **DTOs (Data Transfer Objects)**
- `GetTranscriptDTO` - Fetch transcript with caching options
- `ProcessTranscriptDTO` - Process and save transcripts from various sources
- `SearchTranscriptDTO` - Search transcripts with filters
- `SpeechToTextDTO` - Convert audio to text
- `TranscriptAnalysisDTO` - Analyze transcript difficulty and suitability
- `ExportTranscriptDTO` - Export in multiple formats
- `BatchProcessTranscriptDTO` - Batch processing support

### 2. **Service Implementation**
- **Core Features:**
  - Fetch transcripts from YouTube with automatic caching
  - Process and segment transcripts into practice-ready sentences
  - Calculate difficulty levels for sentences and overall content
  - Search transcripts with relevance scoring
  - Speech-to-text conversion with multiple service support

- **Advanced Features:**
  - Transcript analysis with learning recommendations
  - Vocabulary level assessment (A1-C2)
  - Speaking rate calculation
  - Key phrase extraction
  - Topic identification

### 3. **API Endpoints**
- `GET /api/transcript/:videoId` - Get transcript with caching
- `POST /api/transcript/:videoId/process` - Process new transcript
- `GET /api/transcript/search` - Search across transcripts
- `POST /api/transcript/speech-to-text` - Convert audio to text
- `GET /api/transcript/:videoId/analysis` - Analyze for learning
- `GET /api/transcript/:videoId/export` - Export formats
- `POST /api/transcript/batch` - Batch processing

### 4. **Integration Points**
- **YouTube Integration Module** - Fetches captions when not in cache
- **Redis** - 7-day caching for transcripts, 1-hour for search results
- **Speech-to-Text Services:**
  - OpenAI Whisper (primary)
  - Google Speech-to-Text (optional)
  - AssemblyAI (optional)

### 5. **Security & Performance**
- Rate limiting on all endpoints
- Subscription checks for premium features
- Efficient caching strategy
- Input validation with Zod schemas

## 🔧 Configuration Required

Add these to your `.env` file:
```env
# Speech-to-Text Services (at least one recommended)
OPENAI_WHISPER_API_KEY=sk-...
GOOGLE_SPEECH_API_KEY=...     # Optional
ASSEMBLYAI_API_KEY=...        # Optional
```

## 📝 Usage Examples

### 1. Get Transcript
```bash
curl -X GET "http://localhost:3000/api/transcript/dQw4w9WgXcQ?language=en" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Search Transcripts
```bash
curl -X GET "http://localhost:3000/api/transcript/search?query=learn%20english&difficultyLevel=3" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Analyze Transcript
```bash
curl -X GET "http://localhost:3000/api/transcript/dQw4w9WgXcQ/analysis" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🚀 Next Steps

1. **Register Module Routes** in `src/app.ts`:
```typescript
import transcriptRoutes from '@modules/transcript';
app.register(transcriptRoutes, { prefix: '/api/transcript' });
```

2. **Update Module Config** in `src/infrastructure/modules/module.config.ts`

3. **Test the Module**:
```bash
./scripts/test-transcript-api.sh
```

## 📊 Module Statistics

- **Files Created**: 7 core files + tests
- **API Endpoints**: 8 endpoints
- **DTOs**: 10+ data models
- **Caching**: 2 cache strategies
- **Services Integrated**: 3 STT services

## 🎯 Key Features for Language Learning

1. **Sentence Segmentation** - Breaks transcripts into manageable chunks
2. **Difficulty Analysis** - Helps users find content at their level
3. **Speaking Rate** - Identifies fast/slow speakers
4. **Vocabulary Assessment** - Matches content to CEFR levels
5. **Practice Recommendations** - Personalized learning suggestions

## 🔜 Coming Next: Practice Session Module

The next module will handle:
- Creating and managing practice sessions
- Saving user progress and position
- Session settings (speed, loop count)
- Resume functionality
- Practice history tracking
