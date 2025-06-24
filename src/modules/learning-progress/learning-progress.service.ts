// CREATED: 2025-06-20 - Core service for tracking and analyzing learning progress

import { Service } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';
import { AppError } from '@shared/errors';
import {
  TrackProgressDTO,
  UpdateProgressDTO,
  AnalyticsQueryDTO,
  GenerateReportDTO,
  GetRecommendationsDTO,
  StreakQueryDTO,
  ProgressReportDTO,
  RecommendationDTO,
  StreakDataDTO,
  MilestoneDTO,
} from './learning-progress.dto';
import { LearningProgressEvents } from './learning-progress.events';
import { AnalyticsService } from '@modules/analytics';
import { UserService } from '@modules/user';

@Service()
export class LearningProgressService {
  private readonly CACHE_PREFIX = 'learning-progress:';
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly MILESTONE_THRESHOLDS = {
    streak: [3, 7, 14, 30, 50, 100],
    sentences: [10, 50, 100, 250, 500, 1000],
    minutes: [30, 60, 120, 300, 600, 1200],
    videos: [5, 10, 25, 50, 100],
  };

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private eventEmitter: EventEmitter,
    private analyticsService: AnalyticsService,
    private userService: UserService,
  ) {}

  /**
   * Track progress for a single sentence
   */
  async trackProgress(userId: string, data: TrackProgressDTO): Promise<void> {
    try {
      // Check if progress already exists
      const existing = await this.prisma.learningProgress.findUnique({
        where: {
          userId_videoId_sentenceIndex: {
            userId,
            videoId: data.videoId,
            sentenceIndex: data.sentenceIndex,
            completedAt: data.completed ? new Date() : null,
            difficultyMarked: data.difficultyMarked || false,
            attemptsCount: 1,
            bestScore: data.score,
            timeSpent: data.timeSpent,
          },
        },
      });

      // Emit progress event
      this.eventEmitter.emit(LearningProgressEvents.PROGRESS_TRACKED, {
        userId,
        videoId: data.videoId,
        sentenceIndex: data.sentenceIndex,
        sessionId: data.sessionId,
      });

      // Check for milestones
      await this.checkMilestones(userId);

      // Clear user's analytics cache
      await this.clearUserCache(userId);
    } catch (error) {
      logger.error('Failed to track progress', error as Error);
      throw error;
    }
  }

  /**
   * Update progress for multiple sentences
   */
  async updateProgress(userId: string, data: UpdateProgressDTO): Promise<void> {
    try {
      const updates = data.progress.map(item =>
        this.trackProgress(userId, {
          sessionId: data.sessionId,
          videoId: item.sentenceIndex.toString(), // This needs to be fixed - should get videoId from session
          sentenceIndex: item.sentenceIndex,
          completed: item.completed,
          difficultyMarked: item.difficultyMarked || false,
          attemptsCount: 1,
          score: item.score,
          timeSpent: item.timeSpent,
        }),
      );

      await Promise.all(updates);

      // Update session total time
      await this.prisma.practiceSession.update({
        where: { id: data.sessionId },
        data: {
          totalDuration: data.totalTimeSpent,
        },
      });
    } catch (error) {
      logger.error('Failed to update bulk progress', error as Error);
      throw error;
    }
  }

  /**
   * Get learning analytics
   */
  async getAnalytics(userId: string, query: AnalyticsQueryDTO): Promise<any> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}analytics:${userId}:${JSON.stringify(query)}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Calculate date range
      const { startDate, endDate } = this.getDateRange(query);

      // Get progress data
      const progressData = await this.prisma.learningProgress.findMany({
        where: {
          userId,
          completedAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(query.videoId && { videoId: query.videoId }),
        },
        include: {
          video: true,
        },
      });

      // Get session data
      const sessions = await this.prisma.practiceSession.findMany({
        where: {
          userId,
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate metrics
      const metrics = {
        totalSessions: sessions.length,
        totalMinutes: Math.round(sessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0) / 60),
        sentencesCompleted: progressData.filter(p => p.completedAt).length,
        averageScore: this.calculateAverageScore(progressData),
        uniqueVideos: new Set(progressData.map(p => p.videoId)).size,
        difficultyDistribution: this.calculateDifficultyDistribution(progressData),
        progressRate: this.calculateProgressRate(progressData, startDate, endDate),
        streakDays: await this.calculateStreak(userId),
      };

      // Group by time period if requested
      let groupedData;
      if (query.groupBy) {
        groupedData = this.groupDataByPeriod(progressData, query.groupBy);
      }

      const result = {
        metrics,
        timeframe: query.timeframe,
        dateRange: { startDate, endDate },
        ...(groupedData && { grouped: groupedData }),
      };

      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    } catch (error) {
      logger.error('Failed to get analytics', error as Error);
      throw error;
    }
  }

  /**
   * Generate comprehensive progress report
   */
  async generateReport(userId: string, data: GenerateReportDTO): Promise<ProgressReportDTO> {
    try {
      const { startDate, endDate } =
        data.startDate && data.endDate
          ? { startDate: new Date(data.startDate), endDate: new Date(data.endDate) }
          : this.getDateRange({ timeframe: data.timeframe as any });

      // Get all progress data
      const progressData = await this.prisma.learningProgress.findMany({
        where: {
          userId,
          completedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          video: true,
        },
      });

      // Get session data
      const sessions = await this.prisma.practiceSession.findMany({
        where: {
          userId,
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          video: true,
        },
      });

      // Calculate metrics
      const report: ProgressReportDTO = {
        userId,
        timeframe: data.timeframe,
        startDate,
        endDate,

        // Summary metrics
        totalSessions: sessions.length,
        totalMinutes: Math.round(sessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0) / 60),
        sentencesCompleted: progressData.filter(p => p.completedAt).length,
        uniqueVideos: new Set(progressData.map(p => p.videoId)).size,

        // Performance metrics
        averageScore: this.calculateAverageScore(progressData),
        bestScore: Math.max(...progressData.map(p => p.bestScore || 0), 0),
        improvement: await this.calculateImprovement(userId, startDate, endDate),

        // Streak data
        currentStreak: await this.calculateStreak(userId),
        longestStreak: await this.getLongestStreak(userId),
        lastPracticeDate: await this.getLastPracticeDate(userId),

        // Progress by difficulty
        difficultyProgress: await this.getDifficultyProgress(progressData),

        // Top videos
        topVideos: await this.getTopVideos(sessions, progressData),

        // Weak areas
        weakAreas: await this.analyzeWeakAreas(progressData),

        // Daily activity
        dailyActivity: await this.getDailyActivity(userId, startDate, endDate),
      };

      // Emit report generated event
      this.eventEmitter.emit(LearningProgressEvents.REPORT_GENERATED, {
        userId,
        reportType: data.timeframe,
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate report', error as Error);
      throw error;
    }
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(userId: string, query: GetRecommendationsDTO): Promise<RecommendationDTO[]> {
    try {
      // Get user's learning history
      const userProgress = await this.prisma.learningProgress.findMany({
        where: { userId },
        include: { video: true },
        orderBy: { completedAt: 'desc' },
        take: 100,
      });

      // Calculate user preferences
      const preferences = await this.analyzeUserPreferences(userProgress);

      // Get candidate videos
      const candidateVideos = await this.prisma.video.findMany({
        where: {
          language: query.language,
          ...(query.difficulty && { difficultyLevel: query.difficulty }),
          ...(query.preferredDuration && {
            duration: {
              gte: query.preferredDuration.min,
              lte: query.preferredDuration.max,
            },
          }),
          ...(query.excludeWatched && {
            id: {
              notIn: userProgress.map(p => p.videoId),
            },
          }),
        },
        take: query.limit * 3, // Get more candidates for scoring
      });

      // Score and rank recommendations
      const scoredVideos = candidateVideos.map(video => ({
        video,
        score: this.calculateRecommendationScore(video, preferences, userProgress),
      }));

      // Sort by score and take top N
      const recommendations = scoredVideos
        .sort((a, b) => b.score - a.score)
        .slice(0, query.limit)
        .map(({ video, score }) => ({
          videoId: video.id,
          title: video.title,
          duration: video.duration,
          difficulty: video.difficultyLevel,
          language: video.language,
          thumbnailUrl: video.thumbnailUrl,
          reason: this.getRecommendationReason(video, preferences),
          score,
          tags: video.tags,
          previousAttempts: userProgress.filter(p => p.videoId === video.id).length,
          lastAttemptDate: userProgress.find(p => p.videoId === video.id)?.completedAt,
          averageScore: this.calculateAverageScore(userProgress.filter(p => p.videoId === video.id)),
        }));

      return recommendations;
    } catch (error) {
      logger.error('Failed to get recommendations', error as Error);
      throw error;
    }
  }

  /**
   * Calculate practice streaks
   */
  async calculateStreaks(userId: string, query: StreakQueryDTO): Promise<StreakDataDTO> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}streaks:${userId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached && !query.includeHistory) return JSON.parse(cached);

      // Get all practice dates
      const practiceDates = await this.prisma.practiceSession.findMany({
        where: { userId },
        select: { startTime: true },
        orderBy: { startTime: 'desc' },
      });

      // Calculate streaks
      const { currentStreak, longestStreak, practiceCalendar } = this.calculateStreakData(practiceDates);

      // Get total days practiced
      const uniqueDates = new Set(practiceDates.map(p => p.startTime.toISOString().split('T')[0]));
      const totalDaysPracticed = uniqueDates.size;

      // Get milestones
      const milestones = await this.prisma.learningProgress.findMany({
        where: {
          userId,
          completedAt: { not: null },
        },
        select: {
          completedAt: true,
        },
      });

      const streakData: StreakDataDTO = {
        currentStreak,
        longestStreak,
        totalDaysPracticed,
        lastPracticeDate: practiceDates[0]?.startTime || new Date(0),
        milestones: await this.getUserMilestones(userId),
        ...(query.includeHistory && { practiceCalendar }),
      };

      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(streakData));
      return streakData;
    } catch (error) {
      logger.error('Failed to calculate streaks', error as Error);
      throw error;
    }
  }

  // Private helper methods

  private getDateRange(query: { timeframe: 'day' | 'week' | 'month' | 'year' | 'all' }) {
    const endDate = new Date();
    const startDate = new Date();

    switch (query.timeframe) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'all':
        startDate.setFullYear(2020); // Set to a reasonable past date
        break;
    }

    return { startDate, endDate };
  }

  private calculateAverageScore(progressData: any[]): number {
    const scores = progressData.filter(p => p.bestScore).map(p => p.bestScore);
    return scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  }

  private calculateDifficultyDistribution(progressData: any[]) {
    const distribution: Record<number, number> = {};

    progressData.forEach(p => {
      if (p.video?.difficultyLevel) {
        distribution[p.video.difficultyLevel] = (distribution[p.video.difficultyLevel] || 0) + 1;
      }
    });

    return distribution;
  }

  private calculateProgressRate(progressData: any[], startDate: Date, endDate: Date): number {
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const completedCount = progressData.filter(p => p.completedAt).length;
    return Math.round((completedCount / totalDays) * 100) / 100;
  }

  private async calculateStreak(userId: string): Promise<number> {
    const sessions = await this.prisma.practiceSession.findMany({
      where: { userId },
      select: { startTime: true },
      orderBy: { startTime: 'desc' },
    });

    return this.calculateStreakData(sessions).currentStreak;
  }

  private calculateStreakData(sessions: { startTime: Date }[]) {
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate: string | null = null;
    const practiceCalendar: Record<string, any> = {};

    // Sort sessions by date
    const sortedSessions = sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    sortedSessions.forEach(session => {
      const dateStr = session.startTime.toISOString().split('T')[0];

      if (!practiceCalendar[dateStr]) {
        practiceCalendar[dateStr] = {
          practiced: true,
          minutesPracticed: 0,
          sentencesCompleted: 0,
        };
      }

      if (!lastDate) {
        // First date
        tempStreak = 1;
        lastDate = dateStr;
      } else {
        const lastDateObj = new Date(lastDate);
        const currentDateObj = new Date(dateStr);
        const dayDiff = Math.floor((lastDateObj.getTime() - currentDateObj.getTime()) / (1000 * 60 * 60 * 24));

        if (dayDiff === 1) {
          // Consecutive day
          tempStreak++;
        } else if (dayDiff > 1) {
          // Streak broken
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
        // dayDiff === 0 means same day, continue
        lastDate = dateStr;
      }
    });

    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate current streak (from today backwards)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (practiceCalendar[today] || practiceCalendar[yesterday]) {
      currentStreak = tempStreak;
    }

    return { currentStreak, longestStreak, practiceCalendar };
  }

  private async getLongestStreak(userId: string): Promise<number> {
    const sessions = await this.prisma.practiceSession.findMany({
      where: { userId },
      select: { startTime: true },
      orderBy: { startTime: 'desc' },
    });

    return this.calculateStreakData(sessions).longestStreak;
  }

  private async getLastPracticeDate(userId: string): Promise<Date> {
    const lastSession = await this.prisma.practiceSession.findFirst({
      where: { userId },
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    });

    return lastSession?.startTime || new Date(0);
  }

  private async calculateImprovement(userId: string, startDate: Date, endDate: Date): Promise<number> {
    // Get scores from the beginning and end of the period
    const firstScores = await this.prisma.learningProgress.findMany({
      where: {
        userId,
        completedAt: {
          gte: startDate,
          lte: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000), // First week
        },
        bestScore: { not: null },
      },
      select: { bestScore: true },
    });

    const lastScores = await this.prisma.learningProgress.findMany({
      where: {
        userId,
        completedAt: {
          gte: new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000), // Last week
          lte: endDate,
        },
        bestScore: { not: null },
      },
      select: { bestScore: true },
    });

    const avgFirst = this.calculateAverageScore(firstScores);
    const avgLast = this.calculateAverageScore(lastScores);

    return avgFirst > 0 ? Math.round(((avgLast - avgFirst) / avgFirst) * 100) : 0;
  }

  private async getDifficultyProgress(progressData: any[]) {
    const difficultyMap = new Map<number, any>();

    progressData.forEach(p => {
      if (p.video?.difficultyLevel) {
        const level = p.video.difficultyLevel;
        if (!difficultyMap.has(level)) {
          difficultyMap.set(level, {
            level,
            sentencesCompleted: 0,
            totalScore: 0,
            scoreCount: 0,
            timeSpent: 0,
          });
        }

        const data = difficultyMap.get(level);
        if (p.completedAt) data.sentencesCompleted++;
        if (p.bestScore) {
          data.totalScore += p.bestScore;
          data.scoreCount++;
        }
        data.timeSpent += p.timeSpent;
      }
    });

    return Array.from(difficultyMap.values()).map(data => ({
      level: data.level,
      sentencesCompleted: data.sentencesCompleted,
      averageScore: data.scoreCount > 0 ? Math.round(data.totalScore / data.scoreCount) : 0,
      timeSpent: data.timeSpent,
    }));
  }

  private async getTopVideos(sessions: any[], progressData: any[]) {
    const videoStats = new Map<string, any>();

    sessions.forEach(session => {
      if (!videoStats.has(session.videoId)) {
        videoStats.set(session.videoId, {
          videoId: session.videoId,
          title: session.video?.title || 'Unknown',
          sessionsCount: 0,
          completedSentences: 0,
          totalSentences: 0,
          totalScore: 0,
          scoreCount: 0,
        });
      }
      videoStats.get(session.videoId).sessionsCount++;
    });

    progressData.forEach(p => {
      if (videoStats.has(p.videoId)) {
        const stats = videoStats.get(p.videoId);
        stats.totalSentences++;
        if (p.completedAt) stats.completedSentences++;
        if (p.bestScore) {
          stats.totalScore += p.bestScore;
          stats.scoreCount++;
        }
      }
    });

    return Array.from(videoStats.values())
      .map(stats => ({
        videoId: stats.videoId,
        title: stats.title,
        sessionsCount: stats.sessionsCount,
        completionRate:
          stats.totalSentences > 0 ? Math.round((stats.completedSentences / stats.totalSentences) * 100) : 0,
        averageScore: stats.scoreCount > 0 ? Math.round(stats.totalScore / stats.scoreCount) : 0,
      }))
      .sort((a, b) => b.sessionsCount - a.sessionsCount)
      .slice(0, 5);
  }

  private async analyzeWeakAreas(progressData: any[]) {
    const weakAreas = [];

    // Analyze pronunciation scores
    const pronunciationScores = progressData.filter(p => p.bestScore !== null).map(p => p.bestScore);

    if (pronunciationScores.length > 0) {
      const avgPronunciation = this.calculateAverageScore(progressData);
      if (avgPronunciation < 70) {
        weakAreas.push({
          type: 'pronunciation' as const,
          score: avgPronunciation,
          description: 'Your pronunciation needs improvement',
          suggestion: 'Focus on slower playback speeds and repeat difficult sentences more times',
        });
      }
    }

    // Analyze difficulty patterns
    const difficultyMarkedRate = progressData.filter(p => p.difficultyMarked).length / progressData.length;
    if (difficultyMarkedRate > 0.3) {
      weakAreas.push({
        type: 'difficulty' as const,
        score: Math.round((1 - difficultyMarkedRate) * 100),
        description: "You're finding many sentences difficult",
        suggestion: 'Try easier content or reduce playback speed',
      });
    }

    // Analyze completion patterns
    const completionRate = progressData.filter(p => p.completedAt).length / progressData.length;
    if (completionRate < 0.8) {
      weakAreas.push({
        type: 'fluency' as const,
        score: Math.round(completionRate * 100),
        description: 'Your completion rate could be better',
        suggestion: 'Focus on finishing sentences before moving to the next',
      });
    }

    return weakAreas;
  }

  private async getDailyActivity(userId: string, startDate: Date, endDate: Date) {
    const dailyData = await this.prisma.$queryRaw`
      SELECT
        DATE(start_time) as date,
        COUNT(DISTINCT id) as sessions_count,
        SUM(total_duration) / 60 as minutes_practiced
      FROM practice_sessions
      WHERE user_id = ${userId}
        AND start_time >= ${startDate}
        AND start_time <= ${endDate}
      GROUP BY DATE(start_time)
      ORDER BY date DESC
    `;

    const progressByDay = await this.prisma.$queryRaw`
      SELECT
        DATE(completed_at) as date,
        COUNT(*) as sentences_completed
      FROM learning_progress
      WHERE user_id = ${userId}
        AND completed_at >= ${startDate}
        AND completed_at <= ${endDate}
      GROUP BY DATE(completed_at)
    `;

    // Merge the data
    const activityMap = new Map();

    (dailyData as any[]).forEach(d => {
      activityMap.set(d.date.toISOString().split('T')[0], {
        date: d.date.toISOString().split('T')[0],
        minutesPracticed: Math.round(d.minutes_practiced || 0),
        sessionsCount: d.sessions_count || 0,
        sentencesCompleted: 0,
      });
    });

    (progressByDay as any[]).forEach(p => {
      const dateStr = p.date.toISOString().split('T')[0];
      if (activityMap.has(dateStr)) {
        activityMap.get(dateStr).sentencesCompleted = p.sentences_completed || 0;
      }
    });

    return Array.from(activityMap.values());
  }

  private async analyzeUserPreferences(userProgress: any[]) {
    // Analyze user's learning patterns
    const preferences = {
      preferredDifficulty: 0,
      averageSessionDuration: 0,
      preferredVideoLength: 0,
      topTags: [] as string[],
      learningSpeed: 0,
    };

    if (userProgress.length === 0) {
      return preferences;
    }

    // Calculate preferred difficulty
    const difficulties = userProgress.filter(p => p.video?.difficultyLevel).map(p => p.video.difficultyLevel);
    preferences.preferredDifficulty =
      difficulties.length > 0 ? Math.round(difficulties.reduce((sum, d) => sum + d, 0) / difficulties.length) : 3;

    // Calculate preferred video length
    const videoLengths = userProgress.filter(p => p.video?.duration).map(p => p.video.duration);
    preferences.preferredVideoLength =
      videoLengths.length > 0 ? Math.round(videoLengths.reduce((sum, d) => sum + d, 0) / videoLengths.length) : 300;

    // Extract top tags
    const tagCounts = new Map<string, number>();
    userProgress.forEach(p => {
      if (p.video?.tags) {
        p.video.tags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });
    preferences.topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    return preferences;
  }

  private calculateRecommendationScore(video: any, preferences: any, userProgress: any[]): number {
    let score = 50; // Base score

    // Difficulty match
    const difficultyDiff = Math.abs(video.difficultyLevel - preferences.preferredDifficulty);
    score -= difficultyDiff * 10;

    // Duration match
    const durationDiff = Math.abs(video.duration - preferences.preferredVideoLength) / 60; // in minutes
    score -= durationDiff * 2;

    // Tag match
    const matchingTags = video.tags.filter((tag: string) => preferences.topTags.includes(tag)).length;
    score += matchingTags * 5;

    // Novelty bonus (not watched recently)
    const lastWatched = userProgress.find(p => p.videoId === video.id);
    if (!lastWatched) {
      score += 10;
    } else {
      const daysSinceWatched = (Date.now() - lastWatched.completedAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.min(daysSinceWatched, 10);
    }

    return Math.max(0, Math.min(100, score));
  }

  private getRecommendationReason(video: any, preferences: any): string {
    if (video.difficultyLevel === preferences.preferredDifficulty) {
      return 'Matches your preferred difficulty level';
    }
    if (Math.abs(video.duration - preferences.preferredVideoLength) < 60) {
      return 'Perfect duration for your learning style';
    }
    if (video.tags.some((tag: string) => preferences.topTags.includes(tag))) {
      return "Similar to videos you've enjoyed";
    }
    return 'Recommended for your skill level';
  }

  private async checkMilestones(userId: string) {
    // Check various milestone types
    const stats = await this.getUserStats(userId);

    // Check streak milestones
    for (const threshold of this.MILESTONE_THRESHOLDS.streak) {
      if (stats.currentStreak === threshold) {
        await this.awardMilestone(userId, 'streak', threshold);
      }
    }

    // Check sentences milestones
    for (const threshold of this.MILESTONE_THRESHOLDS.sentences) {
      if (stats.totalSentences === threshold) {
        await this.awardMilestone(userId, 'sentences', threshold);
      }
    }

    // Check minutes milestones
    for (const threshold of this.MILESTONE_THRESHOLDS.minutes) {
      if (stats.totalMinutes >= threshold && stats.totalMinutes < threshold + 30) {
        await this.awardMilestone(userId, 'minutes', threshold);
      }
    }
  }

  private async getUserStats(userId: string) {
    const [progress, sessions, currentStreak] = await Promise.all([
      this.prisma.learningProgress.count({
        where: { userId, completedAt: { not: null } },
      }),
      this.prisma.practiceSession.aggregate({
        where: { userId },
        _sum: { totalDuration: true },
      }),
      this.calculateStreak(userId),
    ]);

    return {
      totalSentences: progress,
      totalMinutes: Math.round((sessions._sum.totalDuration || 0) / 60),
      currentStreak,
    };
  }

  private async awardMilestone(userId: string, type: string, value: number) {
    const milestone: MilestoneDTO = {
      type: type as any,
      value,
      title: this.getMilestoneTitle(type, value),
      description: this.getMilestoneDescription(type, value),
      reward: this.getMilestoneReward(type, value),
    };

    // Emit milestone event
    this.eventEmitter.emit(LearningProgressEvents.MILESTONE_ACHIEVED, {
      userId,
      milestone,
    });

    // Track in analytics
    await this.analyticsService.track(userId, 'milestone_achieved', {
      type,
      value,
    });
  }

  private getMilestoneTitle(type: string, value: number): string {
    const titles: Record<string, Record<number, string>> = {
      streak: {
        3: '3-Day Streak!',
        7: 'Week Warrior',
        14: 'Fortnight Fighter',
        30: 'Monthly Master',
        50: 'Persistent Learner',
        100: 'Century Champion',
      },
      sentences: {
        10: 'First Steps',
        50: 'Making Progress',
        100: 'Century Mark',
        250: 'Quarter Master',
        500: 'Half Thousand',
        1000: 'Thousand Sentences!',
      },
      minutes: {
        30: 'Half Hour Hero',
        60: 'Hour Power',
        120: 'Two Hour Champion',
        300: 'Five Hour Fighter',
        600: 'Ten Hour Titan',
        1200: 'Twenty Hour Legend',
      },
    };

    return titles[type]?.[value] || `${type} ${value}`;
  }

  private getMilestoneDescription(type: string, value: number): string {
    return `You've achieved ${value} ${type}! Keep up the great work!`;
  }

  private getMilestoneReward(type: string, value: number) {
    if (value >= 100) {
      return { type: 'badge' as const, value: `${type}_${value}` };
    }
    return { type: 'points' as const, value: value * 10 };
  }

  private async getUserMilestones(userId: string) {
    // This would typically fetch from a milestones table
    // For now, return calculated milestones
    const stats = await this.getUserStats(userId);
    const milestones = [];

    // Add achieved milestones
    for (const [type, thresholds] of Object.entries(this.MILESTONE_THRESHOLDS)) {
      const currentValue =
        type === 'streak' ? stats.currentStreak : type === 'sentences' ? stats.totalSentences : stats.totalMinutes;

      for (const threshold of thresholds) {
        if (currentValue >= threshold) {
          milestones.push({
            type,
            value: threshold,
            achievedAt: new Date(), // This would be the actual achievement date
            reward: this.getMilestoneReward(type, threshold),
          });
        }
      }
    }

    return milestones;
  }

  private async clearUserCache(userId: string) {
    const pattern = `${this.CACHE_PREFIX}*:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private groupDataByPeriod(data: any[], groupBy: 'day' | 'week' | 'month') {
    const grouped = new Map<string, any>();

    data.forEach(item => {
      if (!item.completedAt) return;

      let key: string;
      const date = new Date(item.completedAt);

      switch (groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          period: key,
          sentencesCompleted: 0,
          totalScore: 0,
          scoreCount: 0,
          timeSpent: 0,
        });
      }

      const group = grouped.get(key);
      group.sentencesCompleted++;
      if (item.bestScore) {
        group.totalScore += item.bestScore;
        group.scoreCount++;
      }
      group.timeSpent += item.timeSpent;
    });

    return Array.from(grouped.values()).map(group => ({
      ...group,
      averageScore: group.scoreCount > 0 ? Math.round(group.totalScore / group.scoreCount) : 0,
    }));
  }
}
