// YouTube Shadowing analytics tracking integration

import { Service } from 'typedi';
import { AnalyticsService } from '@modules/analytics/analytics.service';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';

export interface ShadowingEvent {
  category: 'video' | 'practice' | 'audio' | 'progress' | 'subscription';
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
}

export interface ShadowingMetrics {
  // Practice metrics
  totalPracticeTime: number;
  averageSessionDuration: number;
  sentencesCompleted: number;
  difficultySentencesMarked: number;

  // Audio metrics
  recordingsCreated: number;
  averagePronunciationScore: number;
  audioProcessingTime: number;

  // Video metrics
  uniqueVideosWatched: number;
  favoriteVideoCategories: string[];
  preferredDifficulty: number;

  // Engagement metrics
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  retentionRate: number;

  // Conversion metrics
  freeToProConversion: number;
  trialConversionRate: number;
  upgradeFromLimitPrompts: number;
}

@Service()
export class ShadowingAnalyticsIntegration {
  // Event categories
  private readonly EVENT_CATEGORIES = {
    VIDEO_DISCOVERY: 'video_discovery',
    PRACTICE_SESSION: 'practice_session',
    AUDIO_RECORDING: 'audio_recording',
    LEARNING_PROGRESS: 'learning_progress',
    SUBSCRIPTION_FLOW: 'subscription_flow',
    FEATURE_USAGE: 'feature_usage',
    ERROR_TRACKING: 'error_tracking'
  };

  // Key events to track
  private readonly TRACKED_EVENTS = {
    // Video events
    VIDEO_SEARCHED: 'video_searched',
    VIDEO_SELECTED: 'video_selected',
    VIDEO_INFO_VIEWED: 'video_info_viewed',
    TRANSCRIPT_LOADED: 'transcript_loaded',

    // Practice session events
    SESSION_STARTED: 'session_started',
    SESSION_PAUSED: 'session_paused',
    SESSION_RESUMED: 'session_resumed',
    SESSION_COMPLETED: 'session_completed',
    SENTENCE_COMPLETED: 'sentence_completed',
    SENTENCE_MARKED_DIFFICULT: 'sentence_marked_difficult',
    PLAYBACK_SPEED_CHANGED: 'playback_speed_changed',
    LOOP_COUNT_CHANGED: 'loop_count_changed',

    // Audio recording events
    RECORDING_STARTED: 'recording_started',
    RECORDING_COMPLETED: 'recording_completed',
    RECORDING_UPLOADED: 'recording_uploaded',
    RECORDING_PROCESSED: 'recording_processed',
    PRONUNCIATION_SCORE_RECEIVED: 'pronunciation_score_received',

    // Progress events
    MILESTONE_ACHIEVED: 'milestone_achieved',
    STREAK_MAINTAINED: 'streak_maintained',
    STREAK_BROKEN: 'streak_broken',
    REPORT_GENERATED: 'report_generated',
    RECOMMENDATION_CLICKED: 'recommendation_clicked',

    // Subscription events
    LIMIT_WARNING_SHOWN: 'limit_warning_shown',
    LIMIT_EXCEEDED: 'limit_exceeded',
    UPGRADE_PROMPT_SHOWN: 'upgrade_prompt_shown',
    UPGRADE_PROMPT_CLICKED: 'upgrade_prompt_clicked',
    PLAN_UPGRADED: 'plan_upgraded',

    // Feature usage
    EXPORT_USED: 'export_used',
    OFFLINE_MODE_ACTIVATED: 'offline_mode_activated',
    CUSTOM_VOCABULARY_ADDED: 'custom_vocabulary_added',
    AI_FEEDBACK_REQUESTED: 'ai_feedback_requested'
  };

  constructor(
    private analyticsService: AnalyticsService,
    private eventEmitter: EventEmitter
  ) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for all YouTube Shadowing events
   */
  private setupEventListeners(): void {
    // Video discovery events
    this.listenToVideoEvents();

    // Practice session events
    this.listenToPracticeEvents();

    // Audio recording events
    this.listenToAudioEvents();

    // Learning progress events
    this.listenToProgressEvents();

    // Subscription/billing events
    this.listenToSubscriptionEvents();

    // Feature usage events
    this.listenToFeatureEvents();

    logger.info('YouTube Shadowing analytics integration initialized');
  }

  /**
   * Track custom shadowing event
   */
  async trackEvent(
    userId: string,
    event: ShadowingEvent
  ): Promise<void> {
    try {
      await this.analyticsService.track(userId, {
        event: `shadowing_${event.category}_${event.action}`,
        properties: {
          category: event.category,
          action: event.action,
          label: event.label,
          value: event.value,
          ...event.metadata,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to track shadowing event', error as Error);
    }
  }

  /**
   * Track page view with shadowing context
   */
  async trackPageView(
    userId: string,
    page: string,
    context?: Record<string, any>
  ): Promise<void> {
    await this.analyticsService.page(userId, {
      name: page,
      properties: {
        module: 'youtube_shadowing',
        ...context
      }
    });
  }

  /**
   * Get shadowing-specific analytics
   */
  async getShadowingMetrics(
    userId?: string,
    timeframe: 'day' | 'week' | 'month' | 'year' = 'week'
  ): Promise<ShadowingMetrics> {
    const startDate = this.getStartDate(timeframe);
    const endDate = new Date();

    // This would query from your analytics database
    // For now, returning mock data structure
    const metrics: ShadowingMetrics = {
      totalPracticeTime: 0,
      averageSessionDuration: 0,
      sentencesCompleted: 0,
      difficultySentencesMarked: 0,
      recordingsCreated: 0,
      averagePronunciationScore: 0,
      audioProcessingTime: 0,
      uniqueVideosWatched: 0,
      favoriteVideoCategories: [],
      preferredDifficulty: 3,
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      retentionRate: 0,
      freeToProConversion: 0,
      trialConversionRate: 0,
      upgradeFromLimitPrompts: 0
    };

    return metrics;
  }

  /**
   * Create funnel analysis for user journey
   */
  async analyzeFunnel(funnelName: string): Promise<any> {
    const funnels = {
      'first_practice': [
        this.TRACKED_EVENTS.VIDEO_SEARCHED,
        this.TRACKED_EVENTS.VIDEO_SELECTED,
        this.TRACKED_EVENTS.SESSION_STARTED,
        this.TRACKED_EVENTS.SENTENCE_COMPLETED,
        this.TRACKED_EVENTS.SESSION_COMPLETED
      ],
      'recording_flow': [
        this.TRACKED_EVENTS.SESSION_STARTED,
        this.TRACKED_EVENTS.RECORDING_STARTED,
        this.TRACKED_EVENTS.RECORDING_COMPLETED,
        this.TRACKED_EVENTS.RECORDING_UPLOADED,
        this.TRACKED_EVENTS.PRONUNCIATION_SCORE_RECEIVED
      ],
      'upgrade_flow': [
        this.TRACKED_EVENTS.LIMIT_WARNING_SHOWN,
        this.TRACKED_EVENTS.LIMIT_EXCEEDED,
        this.TRACKED_EVENTS.UPGRADE_PROMPT_SHOWN,
        this.TRACKED_EVENTS.UPGRADE_PROMPT_CLICKED,
        this.TRACKED_EVENTS.PLAN_UPGRADED
      ]
    };

    const funnel = funnels[funnelName];
    if (!funnel) {
      throw new Error(`Unknown funnel: ${funnelName}`);
    }

    // This would analyze the funnel conversion rates
    return {
      name: funnelName,
      steps: funnel,
      conversionRates: []
    };
  }

  // Event listener implementations

  private listenToVideoEvents(): void {
    // Video search
    this.eventEmitter.on('youtube:search', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'video',
        action: this.TRACKED_EVENTS.VIDEO_SEARCHED,
        label: data.query,
        metadata: {
          resultsCount: data.resultsCount,
          filters: data.filters
        }
      });
    });

    // Video selection
    this.eventEmitter.on('youtube:video-selected', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'video',
        action: this.TRACKED_EVENTS.VIDEO_SELECTED,
        label: data.videoId,
        metadata: {
          title: data.title,
          duration: data.duration,
          difficulty: data.difficulty,
          source: data.source // search, recommendation, etc.
        }
      });
    });

    // Transcript loaded
    this.eventEmitter.on('transcript:loaded', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'video',
        action: this.TRACKED_EVENTS.TRANSCRIPT_LOADED,
        label: data.videoId,
        value: data.loadTime,
        metadata: {
          source: data.source, // cache, youtube, whisper
          sentenceCount: data.sentenceCount,
          cached: data.cached
        }
      });
    });
  }

  private listenToPracticeEvents(): void {
    // Session lifecycle
    this.eventEmitter.on('practice-session:started', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'practice',
        action: this.TRACKED_EVENTS.SESSION_STARTED,
        label: data.videoId,
        metadata: {
          sessionId: data.sessionId,
          videoTitle: data.videoTitle,
          videoDuration: data.videoDuration,
          startFromSentence: data.startFromSentence
        }
      });
    });

    this.eventEmitter.on('practice-session:completed', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'practice',
        action: this.TRACKED_EVENTS.SESSION_COMPLETED,
        label: data.videoId,
        value: data.totalDuration,
        metadata: {
          sessionId: data.sessionId,
          completedSentences: data.completedSentences,
          totalSentences: data.totalSentences,
          completionRate: data.completionRate,
          averageScore: data.averageScore
        }
      });
    });

    // Sentence events
    this.eventEmitter.on('practice:sentence-completed', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'practice',
        action: this.TRACKED_EVENTS.SENTENCE_COMPLETED,
        label: `${data.videoId}:${data.sentenceIndex}`,
        value: data.attempts,
        metadata: {
          sessionId: data.sessionId,
          sentenceIndex: data.sentenceIndex,
          timeSpent: data.timeSpent,
          score: data.score
        }
      });
    });

    this.eventEmitter.on('practice:difficulty-marked', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'practice',
        action: this.TRACKED_EVENTS.SENTENCE_MARKED_DIFFICULT,
        label: `${data.videoId}:${data.sentenceIndex}`,
        metadata: {
          sessionId: data.sessionId,
          reason: data.reason
        }
      });
    });

    // Settings changes
    this.eventEmitter.on('practice:speed-changed', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'practice',
        action: this.TRACKED_EVENTS.PLAYBACK_SPEED_CHANGED,
        value: data.newSpeed,
        metadata: {
          sessionId: data.sessionId,
          oldSpeed: data.oldSpeed,
          newSpeed: data.newSpeed
        }
      });
    });
  }

  private listenToAudioEvents(): void {
    // Recording events
    this.eventEmitter.on('audio:recording-started', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'audio',
        action: this.TRACKED_EVENTS.RECORDING_STARTED,
        label: data.recordingId,
        metadata: {
          sessionId: data.sessionId,
          sentenceIndex: data.sentenceIndex
        }
      });
    });

    this.eventEmitter.on('audio:recording-uploaded', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'audio',
        action: this.TRACKED_EVENTS.RECORDING_UPLOADED,
        label: data.recordingId,
        value: data.fileSize,
        metadata: {
          duration: data.duration,
          format: data.format
        }
      });
    });

    this.eventEmitter.on('audio:analysis-completed', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'audio',
        action: this.TRACKED_EVENTS.PRONUNCIATION_SCORE_RECEIVED,
        label: data.recordingId,
        value: data.score,
        metadata: {
          pronunciationScore: data.pronunciationScore,
          fluencyScore: data.fluencyScore,
          timingScore: data.timingScore,
          processingTime: data.processingTime
        }
      });
    });
  }

  private listenToProgressEvents(): void {
    // Milestones
    this.eventEmitter.on('progress:milestone-achieved', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'progress',
        action: this.TRACKED_EVENTS.MILESTONE_ACHIEVED,
        label: data.milestoneType,
        value: data.milestoneValue,
        metadata: {
          milestone: data.milestone,
          reward: data.reward
        }
      });
    });

    // Streaks
    this.eventEmitter.on('progress:streak-updated', async (data: any) => {
      const action = data.maintained
        ? this.TRACKED_EVENTS.STREAK_MAINTAINED
        : this.TRACKED_EVENTS.STREAK_BROKEN;

      await this.trackEvent(data.userId, {
        category: 'progress',
        action,
        value: data.currentStreak,
        metadata: {
          previousStreak: data.previousStreak,
          isRecord: data.isRecord
        }
      });
    });

    // Reports
    this.eventEmitter.on('progress:report-generated', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'progress',
        action: this.TRACKED_EVENTS.REPORT_GENERATED,
        label: data.reportType,
        metadata: {
          period: data.period,
          format: data.format
        }
      });
    });

    // Recommendations
    this.eventEmitter.on('progress:recommendation-clicked', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'progress',
        action: this.TRACKED_EVENTS.RECOMMENDATION_CLICKED,
        label: data.videoId,
        metadata: {
          recommendationType: data.type,
          position: data.position,
          score: data.score
        }
      });
    });
  }

  private listenToSubscriptionEvents(): void {
    // Limit events
    this.eventEmitter.on('billing:limit-warning', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'subscription',
        action: this.TRACKED_EVENTS.LIMIT_WARNING_SHOWN,
        label: data.limitType,
        value: data.percentUsed,
        metadata: {
          limit: data.limit,
          used: data.used,
          plan: data.currentPlan
        }
      });
    });

    this.eventEmitter.on('billing:limit-exceeded', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'subscription',
        action: this.TRACKED_EVENTS.LIMIT_EXCEEDED,
        label: data.limitType,
        metadata: {
          limit: data.limit,
          attemptedUsage: data.attemptedUsage,
          plan: data.currentPlan
        }
      });
    });

    // Upgrade flow
    this.eventEmitter.on('billing:upgrade-prompt-shown', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'subscription',
        action: this.TRACKED_EVENTS.UPGRADE_PROMPT_SHOWN,
        label: data.promptType,
        metadata: {
          trigger: data.trigger,
          currentPlan: data.currentPlan,
          suggestedPlan: data.suggestedPlan,
          displayLocation: data.location
        }
      });
    });

    this.eventEmitter.on('billing:upgrade-prompt-clicked', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'subscription',
        action: this.TRACKED_EVENTS.UPGRADE_PROMPT_CLICKED,
        label: data.promptType,
        metadata: {
          currentPlan: data.currentPlan,
          targetPlan: data.targetPlan,
          ctaText: data.ctaText
        }
      });
    });

    this.eventEmitter.on('billing:plan-upgraded', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'subscription',
        action: this.TRACKED_EVENTS.PLAN_UPGRADED,
        label: `${data.oldPlan}_to_${data.newPlan}`,
        value: data.newPlanPrice,
        metadata: {
          oldPlan: data.oldPlan,
          newPlan: data.newPlan,
          upgradeSource: data.source,
          revenue: data.revenue
        }
      });
    });
  }

  private listenToFeatureEvents(): void {
    // Export feature
    this.eventEmitter.on('feature:export-used', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'feature_usage',
        action: this.TRACKED_EVENTS.EXPORT_USED,
        label: data.format,
        metadata: {
          videoId: data.videoId,
          exportType: data.type,
          sentenceCount: data.sentenceCount
        }
      });
    });

    // Offline mode
    this.eventEmitter.on('feature:offline-activated', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'feature_usage',
        action: this.TRACKED_EVENTS.OFFLINE_MODE_ACTIVATED,
        value: data.videosDownloaded,
        metadata: {
          storageUsed: data.storageUsed
        }
      });
    });

    // Custom vocabulary
    this.eventEmitter.on('feature:vocabulary-added', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'feature_usage',
        action: this.TRACKED_EVENTS.CUSTOM_VOCABULARY_ADDED,
        value: data.wordCount,
        metadata: {
          listName: data.listName,
          language: data.language
        }
      });
    });

    // AI feedback
    this.eventEmitter.on('feature:ai-feedback', async (data: any) => {
      await this.trackEvent(data.userId, {
        category: 'feature_usage',
        action: this.TRACKED_EVENTS.AI_FEEDBACK_REQUESTED,
        label: data.feedbackType,
        metadata: {
          recordingId: data.recordingId,
          responseTime: data.responseTime
        }
      });
    });
  }

  // Helper methods

  private getStartDate(timeframe: string): Date {
    const now = new Date();
    const date = new Date();

    switch (timeframe) {
      case 'day':
        date.setDate(now.getDate() - 1);
        break;
      case 'week':
        date.setDate(now.getDate() - 7);
        break;
      case 'month':
        date.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        date.setFullYear(now.getFullYear() - 1);
        break;
    }

    return date;
  }

  /**
   * Create custom dashboard for YouTube Shadowing
   */
  async createShadowingDashboard(): Promise<any> {
    return {
      widgets: [
        {
          type: 'metric',
          title: 'Daily Active Users',
          query: 'shadowing_practice_session_started',
          aggregation: 'unique_users',
          timeframe: 'day'
        },
        {
          type: 'chart',
          title: 'Practice Time Trend',
          query: 'shadowing_practice_session_completed',
          metric: 'total_duration',
          groupBy: 'day',
          timeframe: 'week'
        },
        {
          type: 'funnel',
          title: 'First Practice Funnel',
          steps: [
            'video_searched',
            'video_selected',
            'session_started',
            'sentence_completed'
          ]
        },
        {
          type: 'table',
          title: 'Popular Videos',
          query: 'shadowing_video_selected',
          groupBy: 'video_title',
          sortBy: 'count',
          limit: 10
        }
      ]
    };
  }
}
