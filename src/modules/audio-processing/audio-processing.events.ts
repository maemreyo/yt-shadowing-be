import { Service } from 'typedi';
import { EventEmitter } from '@shared/events';
import { logger } from '@shared/logger';

export enum AudioProcessingEvents {
  RECORDING_UPLOADED = 'audio:recording-uploaded',
  PROCESSING_STARTED = 'audio:processing-started',
  PROCESSING_COMPLETED = 'audio:processing-completed',
  PROCESSING_FAILED = 'audio:processing-failed',
  ANALYSIS_COMPLETED = 'audio:analysis-completed',
  RECORDING_DELETED = 'audio:recording-deleted',
  STORAGE_LIMIT_WARNING = 'audio:storage-limit-warning',
  QUALITY_MILESTONE = 'audio:quality-milestone'
}

export interface RecordingUploadedEvent {
  recordingId: string;
  userId: string;
  sessionId: string;
  sentenceIndex: number;
}

export interface ProcessingCompletedEvent {
  recordingId: string;
  operations: string[];
}

export interface AnalysisCompletedEvent {
  recordingId: string;
  userId: string;
  score: number;
}

export interface QualityMilestoneEvent {
  userId: string;
  recordingId: string;
  milestone: 'first_perfect' | 'streak_5' | 'streak_10' | 'improvement_20';
  data: any;
}

@Service()
export class AudioProcessingEventHandlers {
  constructor(private eventEmitter: EventEmitter) {
    this.registerHandlers();
  }

  private registerHandlers() {
    // Handle recording uploaded
    this.eventEmitter.on(
      AudioProcessingEvents.RECORDING_UPLOADED,
      this.handleRecordingUploaded.bind(this)
    );

    // Handle processing completed
    this.eventEmitter.on(
      AudioProcessingEvents.PROCESSING_COMPLETED,
      this.handleProcessingCompleted.bind(this)
    );

    // Handle analysis completed
    this.eventEmitter.on(
      AudioProcessingEvents.ANALYSIS_COMPLETED,
      this.handleAnalysisCompleted.bind(this)
    );

    // Handle quality milestone
    this.eventEmitter.on(
      AudioProcessingEvents.QUALITY_MILESTONE,
      this.handleQualityMilestone.bind(this)
    );

    // Handle storage limit warning
    this.eventEmitter.on(
      AudioProcessingEvents.STORAGE_LIMIT_WARNING,
      this.handleStorageLimitWarning.bind(this)
    );
  }

  private async handleRecordingUploaded(event: RecordingUploadedEvent) {
    try {
      logger.info('Recording uploaded', event);

      // Track analytics
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'recording_uploaded',
        properties: {
          recordingId: event.recordingId,
          sessionId: event.sessionId,
          sentenceIndex: event.sentenceIndex
        }
      });

      // Update practice session
      this.eventEmitter.emit('practice-session:recording-added', {
        sessionId: event.sessionId,
        recordingId: event.recordingId,
        sentenceIndex: event.sentenceIndex
      });
    } catch (error) {
      logger.error('Error handling recording uploaded event', error as Error);
    }
  }

  private async handleProcessingCompleted(event: ProcessingCompletedEvent) {
    try {
      logger.info('Audio processing completed', event);

      // Notify user if real-time updates are enabled
      this.eventEmitter.emit('notification:send', {
        type: 'audio_processed',
        data: {
          recordingId: event.recordingId,
          operations: event.operations
        }
      });
    } catch (error) {
      logger.error('Error handling processing completed event', error as Error);
    }
  }

  private async handleAnalysisCompleted(event: AnalysisCompletedEvent) {
    try {
      logger.info('Audio analysis completed', event);

      // Check for quality milestones
      if (event.score === 100) {
        // Perfect score!
        this.eventEmitter.emit(AudioProcessingEvents.QUALITY_MILESTONE, {
          userId: event.userId,
          recordingId: event.recordingId,
          milestone: 'first_perfect',
          data: { score: event.score }
        });
      }

      // Track improvement
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'audio_analyzed',
        properties: {
          recordingId: event.recordingId,
          score: event.score
        }
      });

      // Update learning progress
      this.eventEmitter.emit('learning-progress:score-recorded', {
        userId: event.userId,
        recordingId: event.recordingId,
        score: event.score
      });
    } catch (error) {
      logger.error('Error handling analysis completed event', error as Error);
    }
  }

  private async handleQualityMilestone(event: QualityMilestoneEvent) {
    try {
      logger.info('Quality milestone reached', event);

      // Send congratulations notification
      const messages = {
        first_perfect: 'Perfect score! 🎉 Your pronunciation is excellent!',
        streak_5: '5 recordings in a row! Keep up the great work! 🔥',
        streak_10: '10 recording streak! You\'re on fire! 🏆',
        improvement_20: '20% improvement! Your practice is paying off! 📈'
      };

      this.eventEmitter.emit('notification:send', {
        userId: event.userId,
        type: 'achievement',
        title: 'Milestone Reached!',
        message: messages[event.milestone],
        data: {
          milestone: event.milestone,
          recordingId: event.recordingId
        }
      });

      // Track achievement
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'quality_milestone_reached',
        properties: {
          milestone: event.milestone,
          ...event.data
        }
      });
    } catch (error) {
      logger.error('Error handling quality milestone event', error as Error);
    }
  }

  private async handleStorageLimitWarning(event: any) {
    try {
      logger.warn('Storage limit warning', event);

      // Send warning notification
      this.eventEmitter.emit('notification:send', {
        userId: event.userId,
        type: 'warning',
        title: 'Storage Limit Warning',
        message: `You've used ${event.percentage}% of your storage quota. Consider deleting old recordings.`,
        action: {
          type: 'manage_recordings',
          url: '/recordings'
        }
      });

      // Track warning
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'storage_limit_warning',
        properties: {
          usagePercentage: event.percentage,
          currentUsageGB: event.currentUsageGB,
          quotaGB: event.quotaGB
        }
      });
    } catch (error) {
      logger.error('Error handling storage limit warning', error as Error);
    }
  }
}