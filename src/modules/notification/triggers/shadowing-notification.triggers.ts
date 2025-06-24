// Notification triggers for YouTube Shadowing milestones and events

import { Service } from 'typedi';
import { NotificationService } from '@modules/notification/notification.service';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';
import { EmailService } from '@modules/email/email.service';

export interface NotificationTemplate {
  id: string;
  type: 'email' | 'push' | 'in-app' | 'all';
  title: string;
  body: string;
  action?: {
    text: string;
    url: string;
  };
  priority: 'low' | 'medium' | 'high';
}

@Service()
export class ShadowingNotificationTriggers {
  // Notification templates
  private readonly TEMPLATES: Record<string, NotificationTemplate> = {
    // Milestone notifications
    FIRST_SESSION_COMPLETE: {
      id: 'first_session_complete',
      type: 'all',
      title: '🎉 Congratulations on Your First Practice!',
      body: 'You\'ve completed your first YouTube shadowing session. Keep up the great work!',
      action: {
        text: 'View Progress',
        url: '/progress'
      },
      priority: 'high'
    },

    STREAK_MILESTONE_3: {
      id: 'streak_milestone_3',
      type: 'all',
      title: '🔥 3-Day Streak Achievement!',
      body: 'You\'ve practiced for 3 days in a row! Your consistency is paying off.',
      action: {
        text: 'Keep Streak Alive',
        url: '/practice'
      },
      priority: 'high'
    },

    STREAK_MILESTONE_7: {
      id: 'streak_milestone_7',
      type: 'all',
      title: '🏆 Week Warrior Achievement!',
      body: 'Amazing! 7 days of consistent practice. You\'re building a powerful habit.',
      priority: 'high'
    },

    STREAK_MILESTONE_30: {
      id: 'streak_milestone_30',
      type: 'all',
      title: '🌟 Monthly Master Achievement!',
      body: '30 days of practice! You\'re officially a YouTube Shadowing master.',
      priority: 'high'
    },

    PERFECT_SCORE: {
      id: 'perfect_score',
      type: 'in-app',
      title: '💯 Perfect Pronunciation!',
      body: 'Wow! You scored 100% on pronunciation. Your hard work is showing!',
      priority: 'medium'
    },

    IMPROVEMENT_MILESTONE: {
      id: 'improvement_milestone',
      type: 'all',
      title: '📈 20% Improvement Achieved!',
      body: 'Your pronunciation scores have improved by 20% this week. Great progress!',
      action: {
        text: 'View Analytics',
        url: '/analytics'
      },
      priority: 'medium'
    },

    // Reminder notifications
    STREAK_REMINDER: {
      id: 'streak_reminder',
      type: 'push',
      title: '🔔 Don\'t Break Your Streak!',
      body: 'You haven\'t practiced today. Keep your {streak} day streak alive!',
      action: {
        text: 'Practice Now',
        url: '/practice'
      },
      priority: 'medium'
    },

    WEEKLY_SUMMARY: {
      id: 'weekly_summary',
      type: 'email',
      title: '📊 Your Weekly Shadowing Summary',
      body: 'Check out your progress this week: {stats}',
      action: {
        text: 'View Full Report',
        url: '/reports/weekly'
      },
      priority: 'low'
    },

    // Limit notifications
    DAILY_LIMIT_WARNING: {
      id: 'daily_limit_warning',
      type: 'in-app',
      title: '⏰ 5 Minutes Remaining',
      body: 'You have 5 minutes of practice time left today on your free plan.',
      action: {
        text: 'Upgrade for Unlimited',
        url: '/pricing'
      },
      priority: 'medium'
    },

    DAILY_LIMIT_REACHED: {
      id: 'daily_limit_reached',
      type: 'all',
      title: '⏱️ Daily Limit Reached',
      body: 'You\'ve used all your practice time today. Upgrade to Pro for unlimited practice!',
      action: {
        text: 'Upgrade Now',
        url: '/billing/upgrade?ref=limit_reached'
      },
      priority: 'high'
    },

    // Feature notifications
    NEW_FEATURE_ANNOUNCEMENT: {
      id: 'new_feature_announcement',
      type: 'email',
      title: '✨ New Feature: AI Pronunciation Feedback',
      body: 'Get instant AI-powered feedback on your pronunciation. Try it now!',
      action: {
        text: 'Try AI Feedback',
        url: '/features/ai-feedback'
      },
      priority: 'low'
    },

    RECORDING_STORAGE_WARNING: {
      id: 'recording_storage_warning',
      type: 'in-app',
      title: '💾 Storage Almost Full',
      body: 'You have space for 2 more recordings. Delete old recordings or upgrade for more storage.',
      action: {
        text: 'Manage Recordings',
        url: '/recordings'
      },
      priority: 'medium'
    }
  };

  // Notification preferences defaults
  private readonly DEFAULT_PREFERENCES = {
    milestones: {
      email: true,
      push: true,
      inApp: true
    },
    reminders: {
      email: false,
      push: true,
      inApp: true
    },
    limits: {
      email: false,
      push: true,
      inApp: true
    },
    features: {
      email: true,
      push: false,
      inApp: true
    }
  };

  constructor(
    private notificationService: NotificationService,
    private emailService: EmailService,
    private eventEmitter: EventEmitter
  ) {
    this.setupTriggers();
  }

  /**
   * Setup all notification triggers
   */
  private setupTriggers(): void {
    // Milestone triggers
    this.setupMilestoneTriggers();

    // Reminder triggers
    this.setupReminderTriggers();

    // Limit triggers
    this.setupLimitTriggers();

    // Feature triggers
    this.setupFeatureTriggers();

    logger.info('YouTube Shadowing notification triggers initialized');
  }

  /**
   * Send notification based on template
   */
  private async sendNotification(
    userId: string,
    templateId: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const template = this.TEMPLATES[templateId];
      if (!template) {
        logger.error('Unknown notification template', { templateId });
        return;
      }

      // Check user preferences
      const preferences = await this.getUserNotificationPreferences(userId);

      // Format message with data
      const formattedNotification = this.formatNotification(template, data);

      // Send based on type and preferences
      const promises = [];

      if (this.shouldSendType('email', template.type, preferences)) {
        promises.push(this.sendEmailNotification(userId, formattedNotification));
      }

      if (this.shouldSendType('push', template.type, preferences)) {
        promises.push(this.sendPushNotification(userId, formattedNotification));
      }

      if (this.shouldSendType('in-app', template.type, preferences)) {
        promises.push(this.sendInAppNotification(userId, formattedNotification));
      }

      await Promise.all(promises);

      // Track notification sent
      this.eventEmitter.emit('analytics:track', {
        userId,
        event: 'notification_sent',
        properties: {
          templateId,
          type: template.type,
          priority: template.priority
        }
      });
    } catch (error) {
      logger.error('Failed to send notification', error as Error);
    }
  }

  // Trigger setup methods

  private setupMilestoneTriggers(): void {
    // First session complete
    this.eventEmitter.on('shadowing:first-session-complete', async (data: any) => {
      await this.sendNotification(data.userId, 'FIRST_SESSION_COMPLETE', {
        sessionDuration: data.duration,
        sentencesCompleted: data.sentencesCompleted
      });
    });

    // Streak milestones
    this.eventEmitter.on('learning-progress.milestone.achieved', async (data: any) => {
      if (data.milestone.type === 'streak') {
        const templateMap: Record<number, string> = {
          3: 'STREAK_MILESTONE_3',
          7: 'STREAK_MILESTONE_7',
          30: 'STREAK_MILESTONE_30'
        };

        const templateId = templateMap[data.milestone.value];
        if (templateId) {
          await this.sendNotification(data.userId, templateId, {
            streak: data.milestone.value
          });
        }
      }

      // Perfect score
      if (data.milestone.type === 'perfect_score') {
        await this.sendNotification(data.userId, 'PERFECT_SCORE', {
          videoTitle: data.videoTitle,
          sentenceText: data.sentenceText
        });
      }
    });

    // Improvement milestone
    this.eventEmitter.on('shadowing:improvement-detected', async (data: any) => {
      if (data.improvementPercent >= 20) {
        await this.sendNotification(data.userId, 'IMPROVEMENT_MILESTONE', {
          improvement: data.improvementPercent,
          period: data.period
        });
      }
    });
  }

  private setupReminderTriggers(): void {
    // Daily streak reminder (scheduled job)
    this.eventEmitter.on('cron:daily-streak-check', async () => {
      const usersAtRisk = await this.getUsersWithStreakAtRisk();

      for (const user of usersAtRisk) {
        await this.sendNotification(user.userId, 'STREAK_REMINDER', {
          streak: user.currentStreak,
          lastPractice: user.lastPracticeTime
        });
      }
    });

    // Weekly summary (scheduled job)
    this.eventEmitter.on('cron:weekly-summary', async () => {
      const users = await this.getActiveUsers();

      for (const user of users) {
        const stats = await this.getWeeklyStats(user.userId);
        await this.sendNotification(user.userId, 'WEEKLY_SUMMARY', {
          stats: this.formatWeeklyStats(stats)
        });
      }
    });
  }

  private setupLimitTriggers(): void {
    // Daily limit warning
    this.eventEmitter.on('shadowing-billing:limit-warning', async (data: any) => {
      if (data.limitType === 'daily_minutes' && data.remaining <= 5) {
        await this.sendNotification(data.userId, 'DAILY_LIMIT_WARNING', {
          remaining: data.remaining,
          plan: data.plan
        });
      }
    });

    // Daily limit reached
    this.eventEmitter.on('shadowing-billing:limit-exceeded', async (data: any) => {
      if (data.limitType === 'daily_minutes') {
        await this.sendNotification(data.userId, 'DAILY_LIMIT_REACHED', {
          plan: data.plan,
          upgradeDiscount: await this.getUpgradeDiscount(data.userId)
        });
      }
    });

    // Recording storage warning
    this.eventEmitter.on('shadowing:storage-warning', async (data: any) => {
      if (data.remainingSlots <= 2) {
        await this.sendNotification(data.userId, 'RECORDING_STORAGE_WARNING', {
          remainingSlots: data.remainingSlots,
          totalSlots: data.totalSlots
        });
      }
    });
  }

  private setupFeatureTriggers(): void {
    // New feature announcements
    this.eventEmitter.on('shadowing:new-feature-released', async (data: any) => {
      const eligibleUsers = await this.getEligibleUsersForFeature(data.feature);

      for (const userId of eligibleUsers) {
        await this.sendNotification(userId, 'NEW_FEATURE_ANNOUNCEMENT', {
          featureName: data.feature.name,
          description: data.feature.description
        });
      }
    });
  }

  // Notification delivery methods

  private async sendEmailNotification(
    userId: string,
    notification: NotificationTemplate
  ): Promise<void> {
    const user = await this.getUserDetails(userId);

    await this.emailService.send({
      to: user.email,
      subject: notification.title,
      template: 'shadowing-notification',
      data: {
        userName: user.firstName || 'Learner',
        title: notification.title,
        body: notification.body,
        action: notification.action
      }
    });
  }

  private async sendPushNotification(
    userId: string,
    notification: NotificationTemplate
  ): Promise<void> {
    await this.notificationService.sendPush(userId, {
      title: notification.title,
      body: notification.body,
      data: {
        type: notification.id,
        url: notification.action?.url
      }
    });
  }

  private async sendInAppNotification(
    userId: string,
    notification: NotificationTemplate
  ): Promise<void> {
    await this.notificationService.create({
      userId,
      type: 'shadowing',
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      action: notification.action,
      metadata: {
        templateId: notification.id
      }
    });
  }

  // Helper methods

  private formatNotification(
    template: NotificationTemplate,
    data?: Record<string, any>
  ): NotificationTemplate {
    if (!data) return template;

    let formattedBody = template.body;

    // Replace placeholders
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      formattedBody = formattedBody.replace(placeholder, data[key]);
    });

    return {
      ...template,
      body: formattedBody
    };
  }

  private shouldSendType(
    type: string,
    templateType: string,
    preferences: any
  ): boolean {
    return templateType === 'all' || templateType === type;
  }

  private async getUserNotificationPreferences(userId: string): Promise<any> {
    // This would fetch from database
    // For now, return defaults
    return this.DEFAULT_PREFERENCES;
  }

  private async getUserDetails(userId: string): Promise<any> {
    // This would fetch user details
    return {
      email: 'user@example.com',
      firstName: 'User'
    };
  }

  private async getUsersWithStreakAtRisk(): Promise<any[]> {
    // Find users who haven't practiced today but have active streaks
    return [];
  }

  private async getActiveUsers(): Promise<any[]> {
    // Get users who practiced in the last week
    return [];
  }

  private async getWeeklyStats(userId: string): Promise<any> {
    // Get user's weekly statistics
    return {};
  }

  private formatWeeklyStats(stats: any): string {
    return `${stats.totalMinutes} minutes practiced, ${stats.sentencesCompleted} sentences completed`;
  }

  private async getUpgradeDiscount(userId: string): Promise<string> {
    // Check if user eligible for upgrade discount
    return '20% off';
  }

  private async getEligibleUsersForFeature(feature: any): Promise<string[]> {
    // Get users eligible for the feature
    return [];
  }

  /**
   * Schedule notification
   */
  async scheduleNotification(
    userId: string,
    templateId: string,
    sendAt: Date,
    data?: Record<string, any>
  ): Promise<void> {
    // Add to job queue
    this.eventEmitter.emit('queue:add-job', {
      queue: 'notifications',
      type: 'scheduled-notification',
      data: {
        userId,
        templateId,
        data
      },
      options: {
        delay: sendAt.getTime() - Date.now()
      }
    });
  }
}
