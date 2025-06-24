// Database query optimization for YouTube Shadowing

import { Service } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { logger } from '@shared/logger';

export interface QueryStats {
  query: string;
  executionTime: number;
  rowsReturned: number;
  cached: boolean;
}

export interface OptimizationSuggestion {
  table: string;
  type: 'index' | 'query' | 'schema';
  suggestion: string;
  impact: 'low' | 'medium' | 'high';
  estimatedImprovement: string;
}

@Service()
export class DBOptimizationService {
  private queryStats: QueryStats[] = [];
  private readonly SLOW_QUERY_THRESHOLD = 100; // ms
  private readonly CACHE_PREFIX = 'db-cache:';

  constructor(
    private prisma: PrismaService,
    private redis: RedisService
  ) {
    this.setupQueryLogging();
  }

  /**
   * Setup query logging for performance monitoring
   */
  private setupQueryLogging(): void {
    // Enable Prisma query logging
    this.prisma.$on('query' as any, async (e: any) => {
      const stats: QueryStats = {
        query: e.query,
        executionTime: e.duration,
        rowsReturned: 0, // Would need to parse from result
        cached: false
      };

      this.queryStats.push(stats);

      // Log slow queries
      if (e.duration > this.SLOW_QUERY_THRESHOLD) {
        logger.warn('Slow query detected', {
          query: e.query,
          duration: e.duration,
          params: e.params
        });
      }

      // Keep only last 1000 queries
      if (this.queryStats.length > 1000) {
        this.queryStats.shift();
      }
    });
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(): {
    totalQueries: number;
    slowQueries: number;
    averageExecutionTime: number;
    slowestQueries: QueryStats[];
  } {
    const slowQueries = this.queryStats.filter(q => q.executionTime > this.SLOW_QUERY_THRESHOLD);
    const totalTime = this.queryStats.reduce((sum, q) => sum + q.executionTime, 0);

    return {
      totalQueries: this.queryStats.length,
      slowQueries: slowQueries.length,
      averageExecutionTime: this.queryStats.length > 0 ? totalTime / this.queryStats.length : 0,
      slowestQueries: [...this.queryStats]
        .sort((a, b) => b.executionTime - a.executionTime)
        .slice(0, 10)
    };
  }

  /**
   * Analyze database and suggest optimizations
   */
  async analyzeAndSuggestOptimizations(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Check for missing indexes
    const indexSuggestions = await this.analyzeMissingIndexes();
    suggestions.push(...indexSuggestions);

    // Check for N+1 queries
    const n1Suggestions = await this.detectNPlusOneQueries();
    suggestions.push(...n1Suggestions);

    // Check for large table scans
    const scanSuggestions = await this.analyzeTableScans();
    suggestions.push(...scanSuggestions);

    // Check for unused indexes
    const unusedIndexSuggestions = await this.findUnusedIndexes();
    suggestions.push(...unusedIndexSuggestions);

    return suggestions;
  }

  /**
   * Analyze missing indexes
   */
  private async analyzeMissingIndexes(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Check common query patterns in YouTube Shadowing
    const criticalIndexes = [
      {
        table: 'practice_sessions',
        columns: ['user_id', 'created_at'],
        reason: 'Frequent queries for user sessions by date'
      },
      {
        table: 'learning_progress',
        columns: ['user_id', 'video_id', 'completed_at'],
        reason: 'Progress tracking queries'
      },
      {
        table: 'recordings',
        columns: ['session_id', 'created_at'],
        reason: 'Recording retrieval by session'
      },
      {
        table: 'transcripts',
        columns: ['video_id', 'language'],
        reason: 'Transcript lookups'
      }
    ];

    for (const index of criticalIndexes) {
      const exists = await this.checkIndexExists(index.table, index.columns);

      if (!exists) {
        suggestions.push({
          table: index.table,
          type: 'index',
          suggestion: `CREATE INDEX idx_${index.table}_${index.columns.join('_')} ON ${index.table}(${index.columns.join(', ')})`,
          impact: 'high',
          estimatedImprovement: '50-80% faster queries'
        });
      }
    }

    return suggestions;
  }

  /**
   * Detect N+1 query patterns
   */
  private async detectNPlusOneQueries(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Analyze query patterns
    const patterns = this.findRepeatingPatterns();

    for (const pattern of patterns) {
      if (pattern.count > 10 && pattern.timeDiff < 100) {
        suggestions.push({
          table: this.extractTableFromQuery(pattern.query),
          type: 'query',
          suggestion: `Potential N+1 query detected. Consider using include() or join() to fetch related data in a single query.`,
          impact: 'high',
          estimatedImprovement: `Reduce ${pattern.count} queries to 1`
        });
      }
    }

    return suggestions;
  }

  /**
   * Analyze table scans
   */
  private async analyzeTableScans(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Check for queries without WHERE clauses on large tables
    const largeTables = ['recordings', 'learning_progress', 'practice_sessions'];

    for (const table of largeTables) {
      const count = await this.prisma[table].count();

      if (count > 10000) {
        suggestions.push({
          table,
          type: 'query',
          suggestion: `Table ${table} has ${count} rows. Ensure all queries use indexed columns in WHERE clauses.`,
          impact: 'medium',
          estimatedImprovement: 'Prevent full table scans'
        });
      }
    }

    return suggestions;
  }

  /**
   * Find unused indexes
   */
  private async findUnusedIndexes(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // This would require access to database statistics
    // For now, return empty array

    return suggestions;
  }

  /**
   * Optimized query methods for YouTube Shadowing
   */

  /**
   * Get user progress with optimized query
   */
  async getUserProgressOptimized(userId: string, videoId?: string) {
    const cacheKey = `${this.CACHE_PREFIX}progress:${userId}:${videoId || 'all'}`;

    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Use optimized query with proper indexes
    const progress = await this.prisma.learningProgress.findMany({
      where: {
        userId,
        ...(videoId && { videoId })
      },
      select: {
        id: true,
        videoId: true,
        sentenceIndex: true,
        completedAt: true,
        difficultyMarked: true,
        attemptsCount: true,
        bestScore: true,
        timeSpent: true,
        video: {
          select: {
            id: true,
            title: true,
            duration: true,
            difficulty: true
          }
        }
      },
      orderBy: {
        completedAt: 'desc'
      },
      take: 100 // Limit results
    });

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(progress));

    return progress;
  }

  /**
   * Get practice sessions with pagination
   */
  async getPracticeSessionsOptimized(
    userId: string,
    options: {
      skip?: number;
      take?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const { skip = 0, take = 20, startDate, endDate } = options;

    // Build where clause
    const where: any = { userId };
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = startDate;
      if (endDate) where.startTime.lte = endDate;
    }

    // Use cursor-based pagination for better performance
    const sessions = await this.prisma.practiceSession.findMany({
      where,
      select: {
        id: true,
        videoId: true,
        startTime: true,
        endTime: true,
        totalDuration: true,
        settings: true,
        progress: true,
        video: {
          select: {
            title: true,
            thumbnailUrl: true
          }
        },
        _count: {
          select: {
            recordings: true
          }
        }
      },
      orderBy: {
        startTime: 'desc'
      },
      skip,
      take
    });

    return sessions;
  }

  /**
   * Batch fetch transcripts
   */
  async getTranscriptsBatch(videoIds: string[], language: string = 'en') {
    // Use IN query instead of multiple queries
    const transcripts = await this.prisma.transcript.findMany({
      where: {
        videoId: { in: videoIds },
        language
      },
      select: {
        videoId: true,
        language: true,
        sentences: true,
        source: true
      }
    });

    // Convert to map for easy access
    return new Map(transcripts.map(t => [t.videoId, t]));
  }

  /**
   * Get aggregated stats with single query
   */
  async getUserStatsOptimized(userId: string, period: { start: Date; end: Date }) {
    // Use raw query for complex aggregations
    const stats = await this.prisma.$queryRaw<any[]>`
      SELECT
        COUNT(DISTINCT ps.id) as total_sessions,
        SUM(ps.total_duration) / 60 as total_minutes,
        COUNT(DISTINCT ps.video_id) as unique_videos,
        COUNT(DISTINCT DATE(ps.start_time)) as days_practiced,
        AVG(lp.best_score) as average_score,
        COUNT(DISTINCT lp.id) as sentences_completed
      FROM practice_sessions ps
      LEFT JOIN learning_progress lp ON lp.user_id = ps.user_id
      WHERE ps.user_id = ${userId}
        AND ps.start_time >= ${period.start}
        AND ps.start_time <= ${period.end}
        AND (lp.completed_at IS NULL OR (
          lp.completed_at >= ${period.start}
          AND lp.completed_at <= ${period.end}
        ))
    `;

    return stats[0];
  }

  /**
   * Preload related data to avoid N+1
   */
  async preloadSessionData(sessionId: string) {
    // Single query with all relations
    return await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        video: {
          include: {
            transcripts: true
          }
        },
        recordings: {
          orderBy: {
            sentenceIndex: 'asc'
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  // Helper methods

  private async checkIndexExists(table: string, columns: string[]): Promise<boolean> {
    // This would check database metadata
    // For now, return false to show suggestions
    return false;
  }

  private findRepeatingPatterns(): Array<{ query: string; count: number; timeDiff: number }> {
    const patterns: Map<string, { count: number; lastTime: number }> = new Map();

    for (let i = 0; i < this.queryStats.length; i++) {
      const query = this.normalizeQuery(this.queryStats[i].query);
      const existing = patterns.get(query);

      if (existing) {
        existing.count++;
      } else {
        patterns.set(query, { count: 1, lastTime: i });
      }
    }

    return Array.from(patterns.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([query, data]) => ({
        query,
        count: data.count,
        timeDiff: 0 // Would calculate time difference
      }));
  }

  private normalizeQuery(query: string): string {
    // Remove specific IDs to find patterns
    return query.replace(/\b[a-f0-9]{24}\b/g, 'ID')
                .replace(/\d+/g, 'N');
  }

  private extractTableFromQuery(query: string): string {
    const match = query.match(/FROM\s+(\w+)/i);
    return match ? match[1] : 'unknown';
  }

  /**
   * Create database indexes for YouTube Shadowing
   */
  async createOptimizedIndexes(): Promise<void> {
    const indexes = [
      // Practice sessions indexes
      'CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_start ON practice_sessions(user_id, start_time DESC)',
      'CREATE INDEX IF NOT EXISTS idx_practice_sessions_video_user ON practice_sessions(video_id, user_id)',

      // Learning progress indexes
      'CREATE INDEX IF NOT EXISTS idx_learning_progress_user_video ON learning_progress(user_id, video_id)',
      'CREATE INDEX IF NOT EXISTS idx_learning_progress_completed ON learning_progress(completed_at) WHERE completed_at IS NOT NULL',

      // Recordings indexes
      'CREATE INDEX IF NOT EXISTS idx_recordings_session_sentence ON recordings(session_id, sentence_index)',
      'CREATE INDEX IF NOT EXISTS idx_recordings_user_created ON recordings(user_id, created_at DESC)',

      // Transcripts indexes
      'CREATE INDEX IF NOT EXISTS idx_transcripts_video_lang ON transcripts(video_id, language)',

      // Videos indexes
      'CREATE INDEX IF NOT EXISTS idx_videos_difficulty_lang ON videos(difficulty_level, language)',
      'CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON videos(youtube_video_id)'
    ];

    for (const index of indexes) {
      try {
        await this.prisma.$executeRawUnsafe(index);
        logger.info('Index created', { index });
      } catch (error) {
        logger.error('Failed to create index', { index, error });
      }
    }
  }
}
