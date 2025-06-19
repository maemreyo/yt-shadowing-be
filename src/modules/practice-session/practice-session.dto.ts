import { z } from 'zod';

/**
 * DTO for session settings
 */
export class SessionSettingsDTO {
  static schema = z.object({
    playbackSpeed: z.number().min(0.5).max(2).default(1),
    loopCount: z.number().min(1).max(10).default(3),
    autoPlay: z.boolean().default(true),
    showTranscript: z.boolean().default(true),
    highlightWords: z.boolean().default(false),
    recordingEnabled: z.boolean().default(true),
    autoRecordAfterLoop: z.boolean().default(false),
    pauseBetweenLoops: z.number().min(0).max(5000).default(1000), // milliseconds
    focusMode: z.boolean().default(false)
  });

  playbackSpeed!: number;
  loopCount!: number;
  autoPlay!: boolean;
  showTranscript!: boolean;
  highlightWords!: boolean;
  recordingEnabled!: boolean;
  autoRecordAfterLoop!: boolean;
  pauseBetweenLoops!: number;
  focusMode!: boolean;
}

/**
 * DTO for creating a new practice session
 */
export class CreateSessionDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID'),
    language: z.string().length(2).default('en'),
    settings: SessionSettingsDTO.schema.optional(),
    startFromSentence: z.number().min(0).optional(),
    endAtSentence: z.number().min(0).optional()
  });

  videoId!: string;
  language!: string;
  settings?: SessionSettingsDTO;
  startFromSentence?: number;
  endAtSentence?: number;
}

/**
 * DTO for saving session state
 */
export class SaveStateDTO {
  static schema = z.object({
    currentPosition: z.number().min(0),
    currentSentenceIndex: z.number().min(0),
    completedSentences: z.array(z.number()).default([]),
    difficultSentences: z.array(z.number()).default([]),
    recordings: z.record(
      z.string(), // sentenceIndex as string
      z.object({
        recordingId: z.string(),
        score: z.number().min(0).max(100).optional(),
        timestamp: z.string().datetime()
      })
    ).default({}),
    settings: SessionSettingsDTO.schema.optional(),
    totalTimeSpent: z.number().min(0).default(0),
    lastActiveAt: z.string().datetime()
  });

  currentPosition!: number;
  currentSentenceIndex!: number;
  completedSentences!: number[];
  difficultSentences!: number[];
  recordings!: Record<string, {
    recordingId: string;
    score?: number;
    timestamp: string;
  }>;
  settings?: SessionSettingsDTO;
  totalTimeSpent!: number;
  lastActiveAt!: string;
}

/**
 * DTO for querying session history
 */
export class SessionHistoryQueryDTO {
  static schema = z.object({
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
    videoId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    orderBy: z.enum(['recent', 'duration', 'progress', 'score']).default('recent'),
    includeStats: z.boolean().default(true)
  });

  limit!: number;
  offset!: number;
  videoId?: string;
  startDate?: string;
  endDate?: string;
  orderBy!: 'recent' | 'duration' | 'progress' | 'score';
  includeStats!: boolean;
}

/**
 * DTO for session summary response
 */
export class SessionSummaryDTO {
  sessionId!: string;
  video!: {
    id: string;
    title: string;
    thumbnailUrl: string;
    duration: number;
  };

  startTime!: Date;
  endTime?: Date;
  duration!: number; // seconds
  isActive!: boolean;

  progress!: {
    completedSentences: number;
    totalSentences: number;
    percentage: number;
  };

  recordings!: {
    count: number;
    averageScore?: number;
  };

  settings!: SessionSettingsDTO;
  canResume!: boolean;
}

/**
 * DTO for updating session settings
 */
export class UpdateSessionSettingsDTO {
  static schema = SessionSettingsDTO.schema.partial();
}

/**
 * DTO for session analytics
 */
export class SessionAnalyticsDTO {
  sessionId!: string;

  practiceMetrics!: {
    totalPracticeTime: number;
    averageLoopsPerSentence: number;
    sentencesPerMinute: number;
    pauseTimeTotal: number;
  };

  difficultyMetrics!: {
    markedDifficultCount: number;
    averageDifficultyScore: number;
    mostDifficultSentences: Array<{
      index: number;
      text: string;
      attempts: number;
    }>;
  };

  recordingMetrics!: {
    totalRecordings: number;
    averageScore: number;
    scoreImprovement: number;
    bestScore: number;
  };

  learningCurve!: Array<{
    timestamp: string;
    score: number;
    sentenceIndex: number;
  }>;
}

/**
 * DTO for batch operations
 */
export class BatchSessionOperationDTO {
  static schema = z.object({
    sessionIds: z.array(z.string()).min(1).max(100),
    operation: z.enum(['delete', 'archive', 'export'])
  });

  sessionIds!: string[];
  operation!: 'delete' | 'archive' | 'export';
}

/**
 * DTO for session export
 */
export class ExportSessionDTO {
  static schema = z.object({
    sessionId: z.string(),
    format: z.enum(['json', 'csv', 'pdf']).default('json'),
    includeRecordings: z.boolean().default(false),
    includeTranscript: z.boolean().default(true),
    includeAnalytics: z.boolean().default(true)
  });

  sessionId!: string;
  format!: 'json' | 'csv' | 'pdf';
  includeRecordings!: boolean;
  includeTranscript!: boolean;
  includeAnalytics!: boolean;
}