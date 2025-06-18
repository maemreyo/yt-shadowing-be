# YouTube Shadowing Backend - Implementation Plan

## 📋 Overview
Triển khai hệ thống YouTube Shadowing Backend dựa trên template SaaS có sẵn. Hệ thống cho phép người dùng luyện tập nói tiếng Anh theo phương pháp shadowing với video YouTube.

## 🎯 Project Constraints
- [x] Package Manager: Always use `pnpm`
- [x] Code Philosophy: CLEAN, MODULAR, and SEPARATION OF CONCERNS
- [x] Research types and APIs before implementation

## 📊 Phase 1: Database Schema & Core Setup (Week 1) - COMPLETED ✅

### Database Schema Extensions
- [x] Create migration for `videos` table
  - [x] youtube_video_id, title, duration, language, difficulty_level, transcript_available
- [x] Create migration for `practice_sessions` table
  - [x] user_id, video_id, start_time, end_time, total_duration, settings, progress
- [x] Create migration for `recordings` table
  - [x] user_id, session_id, sentence timestamps, audio_url, waveform_data, transcription, quality_score
- [x] Create migration for `learning_progress` table
  - [x] user_id, video_id, sentence_index, completed_at, difficulty_marked, attempts_count, best_score

### Environment Configuration - COMPLETED ✅
- [x] Add YouTube API configuration
  - [x] YOUTUBE_API_KEY
  - [x] YOUTUBE_QUOTA_LIMIT
- [x] Add Speech-to-Text service keys
  - [x] OPENAI_WHISPER_API_KEY
  - [x] ASSEMBLYAI_API_KEY (optional)
  - [x] GOOGLE_SPEECH_API_KEY (optional)
- [x] Add audio storage configuration
  - [x] CLOUDFLARE_R2_BUCKET
  - [x] CLOUDFLARE_R2_ACCESS_KEY
  - [x] CLOUDFLARE_R2_SECRET_KEY
- [x] Add feature limits
  - [x] FREE_TIER_DAILY_MINUTES
  - [x] PRO_TIER_DAILY_MINUTES
  - [x] RECORDING_MAX_DURATION

## 🔧 Phase 2: Core Modules Implementation (Weeks 2-3)

### 1. YouTube Integration Module - COMPLETED ✅
- [x] Generate module using `pnpm module:generate`
- [x] Install googleapis dependency
- [x] Implement YouTubeIntegrationService
  - [x] getVideoInfo() - fetch metadata
  - [x] getCaptions() - download available captions
  - [x] searchLearningVideos() - find suitable content
  - [x] validateVideoForLearning() - check suitability
- [x] Create DTOs
  - [x] VideoSearchDTO
  - [x] CaptionRequestDTO
  - [x] VideoInfoDTO
- [x] Implement API endpoints
  - [x] GET /api/youtube/video/:videoId
  - [x] GET /api/youtube/captions/:videoId
  - [x] GET /api/youtube/search
- [x] Add caching for video metadata
- [x] Implement quota management

### 2. Transcript Module - IN PROGRESS 🔧
- [ ] Generate module using `pnpm module:generate`
- [ ] Implement TranscriptService
  - [ ] getTranscript(videoId) - with caching
  - [ ] processYouTubeTranscript() - parse YouTube captions
  - [ ] segmentTranscript() - break into sentences with timestamps
  - [ ] searchTranscripts() - find practice content
- [ ] Create DTOs
  - [ ] GetTranscriptDTO
  - [ ] ProcessTranscriptDTO
  - [ ] SearchTranscriptDTO
- [ ] Implement API endpoints
  - [ ] GET /api/transcript/:videoId
  - [ ] POST /api/transcript/:videoId/process
  - [ ] GET /api/transcript/search
- [ ] Add caching layer for transcripts
- [ ] Implement rate limiting for API calls

### 3. Practice Session Module
- [ ] Generate module using `pnpm module:generate`
- [ ] Implement PracticeSessionService
- [ ] Create DTOs
- [ ] Implement API endpoints
- [ ] Add real-time state synchronization
- [ ] Implement session expiration logic

### 4. Audio Processing Module
- [ ] Generate module using `pnpm module:generate`
- [ ] Install dependencies: fluent-ffmpeg, wavesurfer.js
- [ ] Implement AudioProcessingService
- [ ] Create DTOs
- [ ] Implement API endpoints
- [ ] Setup background jobs for audio processing
- [ ] Implement file size and format validation

### 5. Learning Progress Module
- [ ] Generate module using `pnpm module:generate`
- [ ] Implement LearningProgressService
- [ ] Create DTOs
- [ ] Implement API endpoints
- [ ] Create event handlers for progress tracking
- [ ] Implement analytics aggregation

## 💼 Phase 3: Integration & Enhancement (Weeks 4-5)

### Subscription & Billing Integration
- [ ] Update subscription plans with shadowing features
- [ ] Implement usage tracking
- [ ] Create billing webhooks for plan changes

### Security & Performance
- [ ] Implement audio file validation
- [ ] Add virus scanning for uploads
- [ ] Setup CDN for audio delivery
- [ ] Implement request throttling
- [ ] Add comprehensive error handling

### Testing & Documentation
- [ ] Write unit tests for all services
- [ ] Create integration tests for APIs
- [ ] Document API endpoints with OpenAPI
- [ ] Create user guide documentation
- [ ] Setup monitoring and alerting

## 🚀 Phase 4: System Integration (Week 4)

### Billing Integration
- [ ] Update subscription plans with shadowing features
- [ ] Implement usage tracking for daily minutes
- [ ] Create upgrade prompts when limits reached
- [ ] Add subscription webhooks for plan changes

### Security Implementation
- [ ] Implement audio file validation
- [ ] Add virus scanning for uploads
- [ ] Setup rate limiting for all endpoints
- [ ] Implement CORS policies for extension

### Performance Optimization
- [ ] Setup Redis caching for transcripts
- [ ] Implement CDN for audio delivery
- [ ] Configure background job queues
- [ ] Add database query optimization

### Module Integration
- [ ] Integrate with Analytics module for tracking
- [ ] Setup Notification triggers for milestones
- [ ] Add Support ticket categories
- [ ] Configure Webhook events

## 🚀 Phase 5: Advanced Features (Weeks 5-6)

### AI Integration
- [ ] Implement pronunciation scoring with Whisper
- [ ] Add speech pattern analysis
- [ ] Create personalized feedback system
- [ ] Implement difficulty auto-adjustment

### Analytics Dashboard
- [ ] Create admin analytics endpoints
- [ ] Implement user progress reports
- [ ] Add engagement metrics tracking
- [ ] Create recommendation engine

### Chrome Extension Support
- [ ] Create extension API endpoints
- [ ] Implement CORS for extension domain
- [ ] Add extension-specific authentication
- [ ] Create real-time sync mechanism

## 📈 Success Metrics to Track
- [ ] Setup analytics for:
  - [ ] Daily active users
  - [ ] Average session duration
  - [ ] Sentences completed per session
  - [ ] Free to Pro conversion rate
  - [ ] API costs per user

## 🐛 Known Issues & Risks
- [ ] YouTube API quota limits (10,000 units/day)
- [ ] Audio storage costs at scale
- [ ] Speech-to-text API costs
- [ ] Real-time processing latency

## 📝 Notes
- Prioritize MVP features for first release
- Focus on cost optimization from the start
- Leverage existing auth, user, and billing modules
- Implement smart caching to reduce API calls

## 🚧 Current Status: Phase 1 - Database Schema
Last Updated: 2025-06-18
