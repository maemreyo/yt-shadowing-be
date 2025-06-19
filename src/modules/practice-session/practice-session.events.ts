import { Service } from 'typedi';
import { EventEmitter } from '@shared/events';
import { logger } from '@shared/logger';

export enum PracticeSessionEvents {
  SESSION_CREATED = 'practice-session:created',
  SESSION_RESUMED = 'practice-session:resumed',
  SESSION_ENDED = 'practice-session:ended',
  STATE_SAVED = 'practice-session:state-saved',
  SETTINGS_UPDATED = 'practice-session:settings-updated',
  RECORDING_ADDED = 'practice-session:recording-added',
  MILESTONE_REACHED = 'practice-session:milestone-reached',
  LIMIT_EXCEEDED = 'practice-session:limit-exceeded'
}

export interface SessionCreatedEvent {
  sessionId: string;
  userId: string;
  videoId: string;
}

export interface StateSavedEvent {
  sessionId: string;
  userId: string;
  completedSentences: number;
}

export interface MilestoneReachedEvent {
  sessionId: string;
  userId: string;
  milestone: 'first_sentence' | 'half_complete' | 'complete' | 'perfect_score';
  data: any;
}

@Service()
export class PracticeSessionEventHandlers {
  constructor(private eventEmitter: EventEmitter) {
    this.registerHandlers();
  }

  private registerHandlers() {
    // Handle session created
    this.eventEmitter.on(
      PracticeSessionEvents.SESSION_CREATED,
      this.handleSessionCreated.bind(this)
    );

    // Handle state saved
    this.eventEmitter.on(
      PracticeSessionEvents.STATE_SAVED,
      this.handleStateSaved.bind(this)
    );

    // Handle milestone reached
    this.eventEmitter.on(
      PracticeSessionEvents.MILESTONE_REACHED,
      this.handleMilestoneReached.bind(this)
    );

    // Handle limit exceeded
    this.eventEmitter.on(
      PracticeSessionEvents.LIMIT_EXCEEDED,
      this.handleLimitExceeded.bind(this)
    );
  }

  private async handleSessionCreated(event: SessionCreatedEvent) {
    try {
      logger.info('Practice session created', event);

      // Track analytics
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'practice_session_created',
        properties: {
          sessionId: event.sessionId,
          videoId: event.videoId
        }
      });

      // Check if this is user's first session
      // Could trigger onboarding or tutorial
    } catch (error) {
      logger.error('Error handling session created event', error as Error);
    }
  }

  private async handleStateSaved(event: StateSavedEvent) {
    try {
      // Check for milestones
      if (event.completedSentences === 1) {
        this.eventEmitter.emit(PracticeSessionEvents.MILESTONE_REACHED, {
          sessionId: event.sessionId,
          userId: event.userId,
          milestone: 'first_sentence',
          data: { completedSentences: 1 }
        });
      }

      // Log progress
      logger.debug('Session state saved', {
        sessionId: event.sessionId,
        completedSentences: event.completedSentences
      });
    } catch (error) {
      logger.error('Error handling state saved event', error as Error);
    }
  }

  private async handleMilestoneReached(event: MilestoneReachedEvent) {
    try {
      logger.info('Milestone reached', event);

      // Send notification
      this.eventEmitter.emit('notification:send', {
        userId: event.userId,
        type: 'milestone',
        title: 'Milestone Reached! 🎉',
        message: this.getMilestoneMessage(event.milestone),
        data: {
          sessionId: event.sessionId,
          milestone: event.milestone
        }
      });

      // Track achievement
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'milestone_reached',
        properties: {
          milestone: event.milestone,
          sessionId: event.sessionId
        }
      });
    } catch (error) {
      logger.error('Error handling milestone reached event', error as Error);
    }
  }

  private async handleLimitExceeded(event: any) {
    try {
      logger.warn('Practice limit exceeded', event);

      // Send upgrade prompt notification
      this.eventEmitter.emit('notification:send', {
        userId: event.userId,
        type: 'upgrade_prompt',
        title: 'Daily Limit Reached',
        message: 'Upgrade to Pro for unlimited practice time!',
        action: {
          type: 'upgrade',
          url: '/pricing'
        }
      });

      // Track conversion opportunity
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'limit_exceeded',
        properties: {
          limitType: 'daily_minutes',
          currentPlan: event.plan || 'free'
        }
      });
    } catch (error) {
      logger.error('Error handling limit exceeded event', error as Error);
    }
  }

  private getMilestoneMessage(milestone: string): string {
    const messages = {
      first_sentence: 'You completed your first sentence! Keep going!',
      half_complete: "You're halfway through! Great progress!",
      complete: 'Congratulations! You completed the entire video!',
      perfect_score: 'Perfect score! Your pronunciation is excellent!'
    };

    return messages[milestone as keyof typeof messages] || 'Great achievement!';
  }
}