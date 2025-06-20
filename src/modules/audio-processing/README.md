# Audio Processing Module

Handles voice recordings, waveform generation, audio analysis, and comparison for language learning practice.

## Features

- 🎤 Audio recording upload and storage
- 🌊 Waveform generation and visualization
- 🗣️ Speech-to-text transcription (multiple providers)
- 📊 Pronunciation analysis and scoring
- 🔄 Audio format conversion
- 📈 Quality assessment and feedback
- 💾 Cloudflare R2 storage integration
- 🚀 Background processing with queues
- 📱 Multi-format support (WebM, WAV, MP3, OGG)

## API Endpoints

### Recording Management
- `POST /api/audio/upload` - Upload a new recording
- `GET /api/audio/:recordingId` - Get recording details
- `DELETE /api/audio/:recordingId` - Delete a recording
- `GET /api/audio/recordings` - List user's recordings

### Processing & Analysis
- `POST /api/audio/:recordingId/process` - Process audio (convert, normalize, etc.)
- `POST /api/audio/compare` - Compare with reference audio
- `GET /api/audio/:recordingId/waveform` - Get waveform data
- `POST /api/audio/waveform` - Generate waveform from URL

### Limits & Settings
- `GET /api/audio/limits` - Get recording limits
- `PUT /api/audio/settings/quality` - Update quality settings

### Bulk Operations
- `POST /api/audio/export` - Export recording(s)
- `POST /api/audio/bulk` - Bulk operations (delete, reprocess)

## DTOs

### UploadRecordingDTO
```typescript
{
  sessionId: string;           // Practice session ID
  sentenceIndex: number;       // Which sentence being practiced
  sentenceStartTime: number;   // Original sentence start time
  sentenceEndTime: number;     // Original sentence end time
  audioData: string;          // Base64 encoded audio
  mimeType: string;           // audio/webm, audio/wav, etc.
  metadata?: {
    duration?: number;        // Recording duration in seconds
    sampleRate?: number;      // Audio sample rate
    channels?: number;        // Mono(1) or Stereo(2)
    deviceInfo?: string;      // Recording device info
  }
}
```

### AudioAnalysisResultDTO
```typescript
{
  recordingId: string;
  overallScore: number;        // 0-100
  scores: {
    pronunciation: number;     // 0-100
    fluency: number;          // 0-100
    timing: number;           // 0-100
    clarity: number;          // 0-100
  };
  issues?: Array<{            // Specific issues found
    type: string;
    severity: 'low' | 'medium' | 'high';
    word?: string;
    issue: string;
    suggestion: string;
  }>;
  recommendations?: string[]; // Improvement suggestions
}
```

## Storage Limits by Tier

| Feature | Free | Pro | Premium |
|---------|------|-----|---------|
| Max File Size | 10 MB | 50 MB | 100 MB |
| Max Duration | 1 min | 5 min | 10 min |
| Daily Uploads | 10 | 100 | Unlimited |
| Storage Quota | 500 MB | 5 GB | 50 GB |

## Audio Processing Operations

### 1. Format Conversion
- Supports conversion between WebM, WAV, MP3, OGG
- Automatic optimization for web playback
- Preserves quality while reducing file size

### 2. Waveform Generation
- Real-time waveform visualization
- Multiple output formats (JSON, SVG)
- Customizable resolution and colors
- Cached for performance

### 3. Audio Normalization
- Loudness normalization for consistent volume
- Noise reduction capabilities
- Echo cancellation

### 4. Speech-to-Text
- Multiple provider support:
  - OpenAI Whisper (primary)
  - Google Speech-to-Text
  - AssemblyAI
- Automatic language detection
- Word-level timestamps

### 5. Pronunciation Analysis
- Compares user recording with original text
- Identifies mispronounced words
- Provides specific feedback
- Calculates accuracy scores

## Background Processing

Audio processing tasks are handled asynchronously:

1. **Upload** - Immediate response with recording ID
2. **Queue** - Processing tasks added to queue
3. **Process** - Background worker processes audio
4. **Notify** - User notified when complete

### Queue Operations
- Convert audio format
- Generate waveform
- Transcribe speech
- Analyze pronunciation
- Cleanup old recordings

## Integration with Other Modules

### Practice Session Module
- Recordings linked to practice sessions
- Automatic progress tracking
- Session-based organization

### Learning Progress Module
- Quality scores feed into progress metrics
- Improvement tracking over time
- Personalized recommendations

### Notification Module
- Processing completion notifications
- Achievement notifications
- Storage limit warnings

## Events Emitted

- `audio:recording-uploaded` - New recording uploaded
- `audio:processing-completed` - Processing finished
- `audio:analysis-completed` - Analysis ready
- `audio:quality-milestone` - Achievement unlocked
- `audio:storage-limit-warning` - Approaching quota

## Configuration

### Required Environment Variables
```env
# Cloudflare R2 Storage
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY=your-access-key
CLOUDFLARE_R2_SECRET_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=shadowing-audio
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Recording Limits
RECORDING_MAX_DURATION=300  # 5 minutes
RECORDING_MAX_SIZE_MB=50    # 50 MB
```

### Optional Speech-to-Text Services
```env
# At least one recommended
OPENAI_WHISPER_API_KEY=sk-...      # Most accurate
GOOGLE_SPEECH_API_KEY=...          # Good for real-time
ASSEMBLYAI_API_KEY=...             # Advanced features
```

## Usage Examples

### 1. Upload a Recording
```bash
curl -X POST http://localhost:3000/api/audio/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "sentenceIndex": 0,
    "sentenceStartTime": 10.5,
    "sentenceEndTime": 15.3,
    "audioData": "data:audio/webm;base64,GkXfo59ChoEBQveBA...",
    "mimeType": "audio/webm"
  }'
```

### 2. Compare Audio
```bash
curl -X POST http://localhost:3000/api/audio/compare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userRecordingId": "recording-123",
    "originalText": "The quick brown fox jumps over the lazy dog",
    "analysisTypes": ["pronunciation", "fluency", "timing"]
  }'
```

### 3. Get Waveform
```bash
curl -X GET "http://localhost:3000/api/audio/recording-123/waveform?format=json&resolution=1000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Error Handling

Common error codes:
- `413` - File too large
- `415` - Unsupported format
- `403` - Recording limit exceeded
- `507` - Storage quota exceeded
- `404` - Recording not found
- `501` - Service not configured

## Performance Considerations

1. **Caching**
   - Waveforms cached for 1 hour
   - Analysis results cached
   - Presigned URLs for direct download

2. **Background Processing**
   - Heavy operations queued
   - Concurrent processing (5 workers)
   - Automatic retries on failure

3. **Storage Optimization**
   - Automatic format optimization
   - Old recordings cleanup
   - Quota monitoring

## Security

- File size validation
- Format validation
- Virus scanning (if configured)
- Ownership verification
- Secure storage with presigned URLs
- Input sanitization

## Testing

Run module tests:
```bash
pnpm test src/modules/audio-processing
```

Test coverage includes:
- Upload and storage
- Format conversion
- Waveform generation
- Analysis accuracy
- Queue processing
- Error scenarios

## Troubleshooting

### Recording Won't Upload
- Check file size limits
- Verify audio format
- Check daily upload limit
- Ensure session is active

### Processing Stuck
- Check queue status
- Verify ffmpeg installation
- Check available disk space
- Review error logs

### Poor Analysis Scores
- Ensure good audio quality
- Check background noise
- Verify correct language
- Use supported formats

## Future Enhancements

- [ ] Real-time audio streaming
- [ ] Advanced noise cancellation
- [ ] Multi-language pronunciation
- [ ] Voice cloning detection
- [ ] Batch download/export
- [ ] Audio enhancement AI

## Dependencies

- **ffmpeg** - Audio processing
- **@aws-sdk/client-s3** - Cloudflare R2 storage
- **openai** - Whisper transcription
- **bull** - Queue management
- **fluent-ffmpeg** - FFmpeg wrapper

## Module Statistics

- **API Endpoints**: 12 endpoints
- **DTOs**: 10 data models
- **Queue Jobs**: 6 job types
- **Events**: 8 event types
- **Middleware**: 5 middleware functions
- **Cache TTL**: 1 hour
- **Max Concurrency**: 5 jobs
