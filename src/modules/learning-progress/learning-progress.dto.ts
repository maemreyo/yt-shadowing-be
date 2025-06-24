// Comprehensive DTOs for Learning Progress tracking

import { z } from 'zod';

/**
 * Track learning progress for a practice session
 */
export class TrackProgressDTO {
  static schema = z.object({
    sessionId: z.string().cuid(),
    videoId: z.string(),
    sentenceIndex: z.number().int().min(0),
    completed: z.boolean(),
    difficultyMarked: z.boolean().default(false),
    attemptsCount: z.number().int().min(1).default(1),
    score: z.number().min(0).max(100).optional(),
    timeSpent: z.number().int().min(0),
    recordingId: z.string().cuid().optional()
  });
}

/**
 * Update progress for multiple sentences at once
 */
export class UpdateProgressDTO {
  static schema = z.object({
    sessionId: z.string().cuid(),
    progress: z.array(z.object({
      sentenceIndex: z.number().int().min(0),
      completed: z.boolean(),
      difficultyMarked: z.boolean().optional(),
      score: z.number().min(0).max(100).optional(),
      timeSpent: z.number().int().min(0)
    })),
    totalTimeSpent: z.number().int().min(0)
  });
}

/**
 * Query analytics data
 */
export class AnalyticsQueryDTO {
  static schema = z.object({
    timeframe: z.enum(['day', 'week', 'month', 'year', 'all']).default('week'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional(),
    videoId: z.string().optional(),
    metrics: z.array(z.enum([
      'totalSessions',
      'totalMinutes',
      'sentencesCompleted',
      'averageScore',
      'streakDays',
      'uniqueVideos',
      'difficultyDistribution',
      'progressRate'
    ])).optional()
  });
}

/**
 * Generate progress report
 */
export class GenerateReportDTO {
  static schema = z.object({
    timeframe: z.enum(['week', 'month', 'quarter', 'year', 'custom']),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    includeRecommendations: z.boolean().default(true),
    includeCharts: z.boolean().default(true),
    format: z.enum(['json', 'pdf', 'html']).default('json')
  });
}

/**
 * Get recommendations
 */
export class GetRecommendationsDTO {
  static schema = z.object({
    limit: z.number().int().min(1).max(50).default(10),
    difficulty: z.number().min(1).max(5).optional(),
    preferredDuration: z.object({
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional()
    }).optional(),
    excludeWatched: z.boolean().default(false),
    language: z.string().min(2).max(2).default('en')
  });
}

/**
 * Streak data query
 */
export class StreakQueryDTO {
  static schema = z.object({
    includeHistory: z.boolean().default(false),
    year: z.number().int().min(2020).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional()
  });
}

/**
 * Progress report response
 */
export class ProgressReportDTO {
  userId: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;

  // Summary metrics
  totalSessions: number;
  totalMinutes: number;
  sentencesCompleted: number;
  uniqueVideos: number;

  // Performance metrics
  averageScore: number;
  bestScore: number;
  improvement: number; // percentage improvement

  // Streak data
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: Date;

  // Progress by difficulty
  difficultyProgress: {
    level: number;
    sentencesCompleted: number;
    averageScore: number;
    timeSpent: number;
  }[];

  // Top videos
  topVideos: Array<{
    videoId: string;
    title: string;
    sessionsCount: number;
    completionRate: number;
    averageScore: number;
  }>;

  // Weak areas
  weakAreas: Array<{
    type: 'pronunciation' | 'fluency' | 'timing' | 'difficulty';
    score: number;
    description: string;
    suggestion: string;
  }>;

  // Daily activity
  dailyActivity: Array<{
    date: string;
    minutesPracticed: number;
    sentencesCompleted: number;
    sessionsCount: number;
  }>;
}

/**
 * Recommendation response
 */
export class RecommendationDTO {
  videoId: string;
  title: string;
  duration: number;
  difficulty: number;
  language: string;
  thumbnailUrl?: string;

  // Recommendation metadata
  reason: string;
  score: number;
  tags: string[];

  // User-specific data
  previousAttempts?: number;
  lastAttemptDate?: Date;
  averageScore?: number;
}

/**
 * Streak data response
 */
export class StreakDataDTO {
  currentStreak: number;
  longestStreak: number;
  totalDaysPracticed: number;
  lastPracticeDate: Date;

  // Calendar data
  practiceCalendar?: {
    [date: string]: {
      practiced: boolean;
      minutesPracticed?: number;
      sentencesCompleted?: number;
    };
  };

  // Milestones
  milestones: Array<{
    type: string;
    value: number;
    achievedAt: Date;
    reward?: string;
  }>;
}

/**
 * Milestone achieved event
 */
export class MilestoneDTO {
  type: 'streak' | 'sentences' | 'minutes' | 'score' | 'videos';
  value: number;
  title: string;
  description: string;
  reward?: {
    type: 'badge' | 'points' | 'unlock';
    value: string | number;
  };
}
