import { Service } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { YouTubeIntegrationService } from '@modules/youtube-integration';
import { TranscriptService } from '@modules/transcript';
import { AppError } from '@shared/errors';
import { logger } from '@shared/logger';
import {
  CreateSessionDTO,
  SaveStateDTO,
  SessionHistoryQueryDTO,
  SessionSummaryDTO,
  SessionAnalyticsDTO,
  UpdateSessionSettingsDTO,
  ExportSessionDTO,
  BatchSessionOperationDTO
} from './practice-session.dto';
import { EventEmitter } from '@shared/events';
import { PracticeSessionEvents } from './practice-session.events';

@Service()
export class PracticeSessionService {
  private readonly CACHE_PREFIX = 'practice-session:';
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly SESSION_EXPIRY = 24 * 60 * 60; // 24 hours

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private youtubeService: YouTubeIntegrationService,
    private transcriptService: TranscriptService,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Create a new practice session
   */
  async createSession(userId: string, data: CreateSessionDTO): Promise<SessionSummaryDTO> {
    try {
      // Validate video exists and is suitable for learning
      const videoValidation = await this.youtubeService.validateVideoForLearning(data.videoId);
      if (!videoValidation.isValid) {
        throw new AppError(
          'Video is not suitable for language learning',
          400,
          'INVALID_VIDEO',
          { issues: videoValidation.issues }
        );
      }

      // Get video metadata
      const videoInfo = await this.youtubeService.getVideoInfo({
        videoId: data.videoId,
        includeCaptions: true,
        includeMetadata: true
      });

      // Get transcript
      const transcript = await this.transcriptService.getTranscript({
        videoId: data.videoId,
        language: data.language,
        includeTimestamps: true
      });

      // Check user's daily limit
      const dailyUsage = await this.checkDailyUsageLimit(userId);
      if (dailyUsage.exceededLimit) {
        throw new AppError(
          'Daily practice limit exceeded',
          403,
          'LIMIT_EXCEEDED',
          {
            limit: dailyUsage.limit,
            used: dailyUsage.used,
            resetAt: dailyUsage.resetAt
          }
        );
      }

      // Create session in database
      const session = await this.prisma.practiceSession.create({
        data: {
          userId,
          videoId: videoInfo.videoId,
          language: data.language,
          settings: data.settings || {},
          startTime: new Date(),
          totalSentences: transcript.sentences.length,
          startFromSentence: data.startFromSentence || 0,
          endAtSentence: data.endAtSentence || transcript.sentences.length - 1,
          status: 'ACTIVE',
          metadata: {
            videoTitle: videoInfo.title,
            videoDuration: videoInfo.duration,
            thumbnailUrl: videoInfo.thumbnailUrl,
            difficulty: videoInfo.difficultyLevel
          }
        }
      });

      // Cache session data
      await this.cacheSessionData(session.id, {
        session,
        transcript,
        videoInfo
      });

      // Emit session created event
      this.eventEmitter.emit(PracticeSessionEvents.SESSION_CREATED, {
        sessionId: session.id,
        userId,
        videoId: data.videoId
      });

      // Track analytics
      await this.trackSessionStart(userId, session.id, data.videoId);

      return this.formatSessionSummary(session, videoInfo);
    } catch (error) {
      logger.error('Failed to create practice session', error as Error);
      throw error;
    }
  }

  /**
   * Save session state
   */
  async saveState(sessionId: string, userId: string, state: SaveStateDTO): Promise<void> {
    try {
      const session = await this.getSessionForUser(sessionId, userId);

      if (session.status !== 'ACTIVE') {
        throw new AppError('Session is not active', 400, 'SESSION_NOT_ACTIVE');
      }

      // Update session in database
      await this.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          currentPosition: state.currentPosition,
          currentSentenceIndex: state.currentSentenceIndex,
          completedSentences: state.completedSentences,
          difficultSentences: state.difficultSentences,
          settings: state.settings || session.settings,
          totalTimeSpent: state.totalTimeSpent,
          lastActiveAt: new Date(state.lastActiveAt),
          progress: {
            ...session.progress,
            lastSavedAt: new Date()
          }
        }
      });

      // Save recordings mapping
      if (Object.keys(state.recordings).length > 0) {
        await this.saveRecordingsMapping(sessionId, state.recordings);
      }

      // Update cache
      await this.updateCachedSessionState(sessionId, state);

      // Emit state saved event
      this.eventEmitter.emit(PracticeSessionEvents.STATE_SAVED, {
        sessionId,
        userId,
        completedSentences: state.completedSentences.length
      });

    } catch (error) {
      logger.error('Failed to save session state', error as Error);
      throw error;
    }
  }

  /**
   * Resume a practice session
   */
  async resumeSession(sessionId: string, userId: string): Promise<any> {
    try {
      const session = await this.getSessionForUser(sessionId, userId);

      // Check if session is resumable
      const lastActiveTime = new Date(session.lastActiveAt || session.startTime);
      const hoursSinceActive = (Date.now() - lastActiveTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceActive > 24) {
        throw new AppError(
          'Session has expired',
          400,
          'SESSION_EXPIRED',
          { expiredHoursAgo: Math.floor(hoursSinceActive - 24) }
        );
      }

      // Get cached or fresh data
      let sessionData = await this.getCachedSessionData(sessionId);

      if (!sessionData) {
        // Reconstruct session data
        const [videoInfo, transcript] = await Promise.all([
          this.youtubeService.getVideoInfo({
            videoId: session.videoId,
            includeCaptions: true,
            includeMetadata: true
          }),
          this.transcriptService.getTranscript({
            videoId: session.videoId,
            language: session.language,
            includeTimestamps: true
          })
        ]);

        sessionData = { session, transcript, videoInfo };
        await this.cacheSessionData(sessionId, sessionData);
      }

      // Update session as active
      await this.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          status: 'ACTIVE',
          lastActiveAt: new Date()
        }
      });

      // Get recordings data
      const recordings = await this.getSessionRecordings(sessionId);

      // Emit session resumed event
      this.eventEmitter.emit(PracticeSessionEvents.SESSION_RESUMED, {
        sessionId,
        userId
      });

      return {
        session: {
          id: session.id,
          currentPosition: session.currentPosition,
          currentSentenceIndex: session.currentSentenceIndex,
          completedSentences: session.completedSentences,
          difficultSentences: session.difficultSentences,
          settings: session.settings,
          totalTimeSpent: session.totalTimeSpent
        },
        video: sessionData.videoInfo,
        transcript: sessionData.transcript,
        recordings
      };
    } catch (error) {
      logger.error('Failed to resume session', error as Error);
      throw error;
    }
  }

  /**
   * Get user's session history
   */
  async getSessionHistory(
    userId: string,
    query: SessionHistoryQueryDTO
  ): Promise<{ sessions: SessionSummaryDTO[]; total: number }> {
    try {
      const where: any = { userId };

      if (query.videoId) {
        where.videoId = query.videoId;
      }

      if (query.startDate || query.endDate) {
        where.startTime = {};
        if (query.startDate) {
          where.startTime.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          where.startTime.lte = new Date(query.endDate);
        }
      }

      // Get total count
      const total = await this.prisma.practiceSession.count({ where });

      // Get sessions with ordering
      const orderBy = this.getOrderByClause(query.orderBy);

      const sessions = await this.prisma.practiceSession.findMany({
        where,
        orderBy,
        skip: query.offset,
        take: query.limit,
        include: {
          recordings: query.includeStats
        }
      });

      // Format sessions
      const formattedSessions = await Promise.all(
        sessions.map(session => this.formatSessionWithStats(session, query.includeStats))
      );

      return { sessions: formattedSessions, total };
    } catch (error) {
      logger.error('Failed to get session history', error as Error);
      throw error;
    }
  }

  /**
   * Update session settings
   */
  async updateSettings(
    sessionId: string,
    userId: string,
    settings: UpdateSessionSettingsDTO
  ): Promise<void> {
    try {
      const session = await this.getSessionForUser(sessionId, userId);

      await this.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          settings: {
            ...session.settings,
            ...settings
          }
        }
      });

      // Update cache
      const cacheKey = `${this.CACHE_PREFIX}${sessionId}`;
      const cachedData = await this.redis.get(cacheKey);

      if (cachedData) {
        const data = JSON.parse(cachedData);
        data.session.settings = { ...data.session.settings, ...settings };
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(data));
      }

      this.eventEmitter.emit(PracticeSessionEvents.SETTINGS_UPDATED, {
        sessionId,
        settings
      });
    } catch (error) {
      logger.error('Failed to update session settings', error as Error);
      throw error;
    }
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId: string, userId: string): Promise<SessionAnalyticsDTO> {
    try {
      const session = await this.getSessionForUser(sessionId, userId);

      // Get all recordings for this session
      const recordings = await this.prisma.recording.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' }
      });

      // Calculate practice metrics
      const practiceMetrics = this.calculatePracticeMetrics(session, recordings);

      // Calculate difficulty metrics
      const difficultyMetrics = await this.calculateDifficultyMetrics(session);

      // Calculate recording metrics
      const recordingMetrics = this.calculateRecordingMetrics(recordings);

      // Generate learning curve
      const learningCurve = this.generateLearningCurve(recordings);

      return {
        sessionId,
        practiceMetrics,
        difficultyMetrics,
        recordingMetrics,
        learningCurve
      };
    } catch (error) {
      logger.error('Failed to get session analytics', error as Error);
      throw error;
    }
  }

  /**
   * Export session data
   */
  async exportSession(userId: string, data: ExportSessionDTO): Promise<any> {
    try {
      const session = await this.getSessionForUser(data.sessionId, userId);

      // Gather export data
      const exportData: any = {
        session: {
          id: session.id,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.totalTimeSpent,
          progress: {
            completed: session.completedSentences.length,
            total: session.totalSentences,
            percentage: (session.completedSentences.length / session.totalSentences) * 100
          }
        }
      };

      // Add transcript if requested
      if (data.includeTranscript) {
        const transcript = await this.transcriptService.getTranscript({
          videoId: session.videoId,
          language: session.language
        });
        exportData.transcript = transcript;
      }

      // Add recordings if requested
      if (data.includeRecordings) {
        const recordings = await this.getSessionRecordings(data.sessionId);
        exportData.recordings = recordings;
      }

      // Add analytics if requested
      if (data.includeAnalytics) {
        const analytics = await this.getSessionAnalytics(data.sessionId, userId);
        exportData.analytics = analytics;
      }

      // Format based on requested format
      return this.formatExportData(exportData, data.format);
    } catch (error) {
      logger.error('Failed to export session', error as Error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async getSessionForUser(sessionId: string, userId: string) {
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    return session;
  }

  private async checkDailyUsageLimit(userId: string) {
    // Get user's subscription tier
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    const tier = user?.subscription?.plan || 'free';
    const limits = {
      free: parseInt(process.env.FREE_TIER_DAILY_MINUTES || '30'),
      pro: parseInt(process.env.PRO_TIER_DAILY_MINUTES || '300'),
      premium: -1 // unlimited
    };

    const limit = limits[tier as keyof typeof limits] || limits.free;

    if (limit === -1) {
      return { exceededLimit: false, limit: -1, used: 0 };
    }

    // Calculate today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayUsage = await this.prisma.practiceSession.aggregate({
      where: {
        userId,
        startTime: { gte: today }
      },
      _sum: {
        totalTimeSpent: true
      }
    });

    const usedMinutes = Math.floor((todayUsage._sum.totalTimeSpent || 0) / 60);

    return {
      exceededLimit: usedMinutes >= limit,
      limit,
      used: usedMinutes,
      resetAt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    };
  }

  private async cacheSessionData(sessionId: string, data: any) {
    const cacheKey = `${this.CACHE_PREFIX}${sessionId}`;
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(data));
  }

  private async getCachedSessionData(sessionId: string) {
    const cacheKey = `${this.CACHE_PREFIX}${sessionId}`;
    const cached = await this.redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  }

  private async updateCachedSessionState(sessionId: string, state: SaveStateDTO) {
    const cacheKey = `${this.CACHE_PREFIX}${sessionId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      const data = JSON.parse(cached);
      data.session = {
        ...data.session,
        currentPosition: state.currentPosition,
        currentSentenceIndex: state.currentSentenceIndex,
        completedSentences: state.completedSentences,
        difficultSentences: state.difficultSentences,
        totalTimeSpent: state.totalTimeSpent
      };
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(data));
    }
  }

  private async saveRecordingsMapping(sessionId: string, recordings: Record<string, any>) {
    const recordingEntries = Object.entries(recordings).map(([sentenceIndex, data]) => ({
      sessionId,
      sentenceIndex: parseInt(sentenceIndex),
      recordingId: data.recordingId,
      score: data.score,
      timestamp: new Date(data.timestamp)
    }));

    if (recordingEntries.length > 0) {
      await this.prisma.sessionRecording.createMany({
        data: recordingEntries,
        skipDuplicates: true
      });
    }
  }

  private async getSessionRecordings(sessionId: string) {
    const recordings = await this.prisma.sessionRecording.findMany({
      where: { sessionId },
      include: {
        recording: {
          select: {
            id: true,
            audioUrl: true,
            transcription: true,
            qualityScore: true,
            createdAt: true
          }
        }
      }
    });

    return recordings.reduce((acc, r) => {
      acc[r.sentenceIndex] = {
        recordingId: r.recordingId,
        score: r.score,
        timestamp: r.timestamp,
        details: r.recording
      };
      return acc;
    }, {} as Record<string, any>);
  }

  private async trackSessionStart(userId: string, sessionId: string, videoId: string) {
    // Track with analytics module if available
    try {
      this.eventEmitter.emit('analytics:track', {
        userId,
        event: 'practice_session_started',
        properties: {
          sessionId,
          videoId,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.warn('Failed to track session start', error as Error);
    }
  }

  private formatSessionSummary(session: any, videoInfo: any): SessionSummaryDTO {
    const progress = {
      completedSentences: session.completedSentences.length,
      totalSentences: session.totalSentences,
      percentage: Math.round((session.completedSentences.length / session.totalSentences) * 100)
    };

    return {
      sessionId: session.id,
      video: {
        id: videoInfo.videoId,
        title: videoInfo.title,
        thumbnailUrl: videoInfo.thumbnailUrl,
        duration: videoInfo.duration
      },
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.totalTimeSpent,
      isActive: session.status === 'ACTIVE',
      progress,
      recordings: {
        count: 0, // Will be updated when recordings are added
        averageScore: undefined
      },
      settings: session.settings,
      canResume: session.status === 'ACTIVE' && !session.endTime
    };
  }

  private async formatSessionWithStats(session: any, includeStats: boolean) {
    const summary = this.formatSessionSummary(session, session.metadata);

    if (includeStats && session.recordings) {
      summary.recordings.count = session.recordings.length;

      if (session.recordings.length > 0) {
        const scores = session.recordings
          .filter((r: any) => r.qualityScore !== null)
          .map((r: any) => r.qualityScore);

        if (scores.length > 0) {
          summary.recordings.averageScore =
            scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        }
      }
    }

    return summary;
  }

  private getOrderByClause(orderBy: string) {
    switch (orderBy) {
      case 'duration':
        return { totalTimeSpent: 'desc' };
      case 'progress':
        return { completedSentences: 'desc' };
      case 'score':
        return { averageScore: 'desc' };
      default:
        return { startTime: 'desc' };
    }
  }

  private calculatePracticeMetrics(session: any, recordings: any[]) {
    const totalPracticeTime = session.totalTimeSpent;
    const sentenceCount = session.completedSentences.length || 1;

    // Calculate average loops per sentence based on recordings
    const recordingsPerSentence = recordings.reduce((acc, r) => {
      acc[r.sentenceIndex] = (acc[r.sentenceIndex] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const avgLoops = Object.values(recordingsPerSentence).length > 0
      ? Object.values(recordingsPerSentence).reduce((a: any, b: any) => a + b, 0) / Object.values(recordingsPerSentence).length
      : 0;

    return {
      totalPracticeTime,
      averageLoopsPerSentence: avgLoops,
      sentencesPerMinute: sentenceCount / (totalPracticeTime / 60),
      pauseTimeTotal: 0 // Would need more detailed tracking
    };
  }

  private async calculateDifficultyMetrics(session: any) {
    const difficultCount = session.difficultSentences.length;

    // Get transcript to get sentence texts
    const transcript = await this.transcriptService.getTranscript({
      videoId: session.videoId,
      language: session.language
    });

    const mostDifficult = session.difficultSentences
      .slice(0, 5)
      .map((index: number) => ({
        index,
        text: transcript.sentences[index]?.text || '',
        attempts: 0 // Would need recording count per sentence
      }));

    return {
      markedDifficultCount: difficultCount,
      averageDifficultyScore: 0, // Would need difficulty scoring
      mostDifficultSentences: mostDifficult
    };
  }

  private calculateRecordingMetrics(recordings: any[]) {
    if (recordings.length === 0) {
      return {
        totalRecordings: 0,
        averageScore: 0,
        scoreImprovement: 0,
        bestScore: 0
      };
    }

    const scores = recordings
      .filter(r => r.qualityScore !== null)
      .map(r => r.qualityScore);

    if (scores.length === 0) {
      return {
        totalRecordings: recordings.length,
        averageScore: 0,
        scoreImprovement: 0,
        bestScore: 0
      };
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    const improvement = lastScore - firstScore;

    return {
      totalRecordings: recordings.length,
      averageScore: avgScore,
      scoreImprovement: improvement,
      bestScore: Math.max(...scores)
    };
  }

  private generateLearningCurve(recordings: any[]) {
    return recordings
      .filter(r => r.qualityScore !== null)
      .map(r => ({
        timestamp: r.createdAt.toISOString(),
        score: r.qualityScore,
        sentenceIndex: r.sentenceIndex
      }));
  }

  private formatExportData(data: any, format: string) {
    switch (format) {
      case 'csv':
        // Convert to CSV format
        return this.convertToCSV(data);
      case 'pdf':
        // Would need PDF generation library
        throw new AppError('PDF export not yet implemented', 501);
      default:
        return data; // JSON format
    }
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion
    const rows = [];
    rows.push(['Practice Session Report']);
    rows.push(['Session ID', data.session.id]);
    rows.push(['Start Time', data.session.startTime]);
    rows.push(['Duration (seconds)', data.session.duration]);
    rows.push(['Progress', `${data.session.progress.percentage}%`]);

    return rows.map(row => row.join(',')).join('\n');
  }
}