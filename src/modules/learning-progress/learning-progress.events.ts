// Event definitions and handlers for learning progress

import { Service } from 'typedi';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';

export enum LearningProgressEvents {
  PROGRESS_TRACKED = 'learning-progress.tracked',
  MILESTONE_ACHIEVED = 'learning-progress.milestone.achieved',
  STREAK_UPDATED = 'learning-progress.streak.updated',
  REPORT_GENERATED = 'learning-progress.report.generated',
  RECOMMENDATION_GENERATED = 'learning-progress.recommendation.generated',
  DIFFICULTY_MARKED = 'learning-progress.difficulty.marked',
  SESSION_COMPLETED = 'learning-progress.session.completed',
  WEEKLY_SUMMARY_READY = 'learning-progress.weekly-summary.ready',
}

interface ProgressTrackedEvent {
  userId: string;
  videoId: string;
  sentenceIndex: number;
  sessionId: string;
}

interface MilestoneAchievedEvent {
  userId: string;
  milestone: {
    type: string;
    value: number;
    title: string;
    description: string;
    reward?: any;
  };
}

interface StreakUpdatedEvent {
  userId: string;
  currentStreak: number;
  previousStreak: number;
  isNewRecord: boolean;
}

interface ReportGeneratedEvent {
  userId: string;
  reportType: string;
  reportId?: string;
}

@Service()
export class LearningProgressEventHandler {
  constructor(private eventEmitter: EventEmitter) {
    this.registerEventHandlers();
  }

  private registerEventHandlers() {
    // Listen to progress tracked events
    this.eventEmitter.on(LearningProgressEvents.PROGRESS_TRACKED, this.handleProgressTracked.bind(this));

    // Listen to milestone achieved events
    this.eventEmitter.on(LearningProgressEvents.MILESTONE_ACHIEVED, this.handleMilestoneAchieved.bind(this));

    // Listen to streak updated events
    this.eventEmitter.on(LearningProgressEvents.STREAK_UPDATED, this.handleStreakUpdated.bind(this));

    // Listen to report generated events
    this.eventEmitter.on(LearningProgressEvents.REPORT_GENERATED, this.handleReportGenerated.bind(this));

    // Listen to external events that affect progress
    this.eventEmitter.on('practice-session.completed', this.handleSessionCompleted.bind(this));
    this.eventEmitter.on('audio-processing.analysis-completed', this.handleAudioAnalyzed.bind(this));
  }

  private async handleProgressTracked(event: ProgressTrackedEvent) {
    try {
      logger.info('Progress tracked', {
        userId: event.userId,
        videoId: event.videoId,
        sentenceIndex: event.sentenceIndex,
      });

      // Track analytics
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'sentence_completed',
        properties: {
          videoId: event.videoId,
          sentenceIndex: event.sentenceIndex,
          sessionId: event.sessionId,
        },
      });
    } catch (error) {
      logger.error('Error handling progress tracked event', error as Error);
    }
  }

  private async handleMilestoneAchieved(event: MilestoneAchievedEvent) {
    try {
      logger.info('Milestone achieved', {
        userId: event.userId,
        milestone: event.milestone.type,
        value: event.milestone.value,
      });

      // Send notification
      this.eventEmitter.emit('notification:send', {
        userId: event.userId,
        type: 'milestone',
        title: event.milestone.title,
        message: event.milestone.description,
        data: {
          milestone: event.milestone,
        },
      });

      // Track analytics
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'milestone_achieved',
        properties: {
          type: event.milestone.type,
          value: event.milestone.value,
          reward: event.milestone.reward,
        },
      });

      // Update user profile if needed
      if (event.milestone.reward?.type === 'badge') {
        this.eventEmitter.emit('user:badge-earned', {
          userId: event.userId,
          badge: event.milestone.reward.value,
        });
      }
    } catch (error) {
      logger.error('Error handling milestone achieved event', error as Error);
    }
  }

  private async handleStreakUpdated(event: StreakUpdatedEvent) {
    try {
      logger.info('Streak updated', {
        userId: event.userId,
        currentStreak: event.currentStreak,
        isNewRecord: event.isNewRecord,
      });

      if (event.isNewRecord) {
        // Send congratulations notification
        this.eventEmitter.emit('notification:send', {
          userId: event.userId,
          type: 'streak_record',
          title: 'New Streak Record! 🔥',
          message: `Amazing! You've practiced for ${event.currentStreak} days in a row!`,
          data: {
            currentStreak: event.currentStreak,
            previousRecord: event.previousStreak,
          },
        });
      }

      // Track analytics
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'streak_updated',
        properties: {
          currentStreak: event.currentStreak,
          isNewRecord: event.isNewRecord,
        },
      });
    } catch (error) {
      logger.error('Error handling streak updated event', error as Error);
    }
  }

  private async handleReportGenerated(event: ReportGeneratedEvent) {
    try {
      logger.info('Report generated', {
        userId: event.userId,
        reportType: event.reportType,
      });

      // Send notification if it's a weekly/monthly report
      if (['week', 'month'].includes(event.reportType)) {
        this.eventEmitter.emit('notification:send', {
          userId: event.userId,
          type: 'report_ready',
          title: `Your ${event.reportType}ly progress report is ready!`,
          message: 'Check out your learning achievements and areas for improvement.',
          data: {
            reportType: event.reportType,
            reportId: event.reportId,
          },
        });
      }

      // Track analytics
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'report_generated',
        properties: {
          reportType: event.reportType,
        },
      });
    } catch (error) {
      logger.error('Error handling report generated event', error as Error);
    }
  }

  private async handleSessionCompleted(event: any) {
    try {
      logger.info('Practice session completed, updating progress', {
        sessionId: event.sessionId,
        userId: event.userId,
      });

      // Emit session completed event for progress tracking
      this.eventEmitter.emit(LearningProgressEvents.SESSION_COMPLETED, {
        userId: event.userId,
        sessionId: event.sessionId,
        videoId: event.videoId,
        completedSentences: event.completedSentences,
        totalDuration: event.totalDuration,
      });

      // Check if it's time for a weekly summary
      const today = new Date();
      if (today.getDay() === 0) {
        // Sunday
        this.eventEmitter.emit(LearningProgressEvents.WEEKLY_SUMMARY_READY, {
          userId: event.userId,
        });
      }
    } catch (error) {
      logger.error('Error handling session completed event', error as Error);
    }
  }

  private async handleAudioAnalyzed(event: any) {
    try {
      if (event.score && event.sessionId) {
        logger.debug('Audio analysis completed, updating progress score', {
          recordingId: event.recordingId,
          score: event.score,
        });

        // Update progress with pronunciation score
        this.eventEmitter.emit('learning-progress:update-score', {
          userId: event.userId,
          recordingId: event.recordingId,
          score: event.score,
          sessionId: event.sessionId,
        });
      }
    } catch (error) {
      logger.error('Error handling audio analyzed event', error as Error);
    }
  }
}
