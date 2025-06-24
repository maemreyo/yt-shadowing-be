// YouTube Shadowing specific billing features

import { Service } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';
import { AppError } from '@shared/errors';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';

export interface ShadowingPlanLimits {
  dailyMinutes: number | 'unlimited';
  maxRecordingsStored: number | 'unlimited';
  audioQuality: 'standard' | 'high' | 'studio';
  speechToTextQuota: number | 'unlimited';
  exportFormats: string[];
  features: string[];
}

export interface UsageData {
  userId: string;
  date: string;
  minutesUsed: number;
  recordingsCreated: number;
  speechToTextCalls: number;
}

@Service()
export class ShadowingBillingService {
  private readonly CACHE_PREFIX = 'shadowing-billing:';
  private readonly USAGE_WINDOW = 24 * 60 * 60; // 24 hours in seconds

  // YouTube Shadowing specific plan features
  private readonly SHADOWING_PLANS: Record<string, ShadowingPlanLimits> = {
    free: {
      dailyMinutes: 30,
      maxRecordingsStored: 10,
      audioQuality: 'standard',
      speechToTextQuota: 50,
      exportFormats: ['srt'],
      features: [
        'basic_transcript',
        'speed_control',
        'loop_playback'
      ]
    },
    starter: {
      dailyMinutes: 120,
      maxRecordingsStored: 50,
      audioQuality: 'high',
      speechToTextQuota: 500,
      exportFormats: ['srt', 'vtt', 'txt'],
      features: [
        'basic_transcript',
        'speed_control',
        'loop_playback',
        'difficulty_analysis',
        'progress_tracking',
        'basic_analytics'
      ]
    },
    pro: {
      dailyMinutes: 'unlimited',
      maxRecordingsStored: 'unlimited',
      audioQuality: 'high',
      speechToTextQuota: 5000,
      exportFormats: ['srt', 'vtt', 'txt', 'json', 'pdf'],
      features: [
        'ai_transcript',
        'speed_control',
        'loop_playback',
        'difficulty_analysis',
        'progress_tracking',
        'advanced_analytics',
        'pronunciation_scoring',
        'custom_vocabulary',
        'offline_mode'
      ]
    },
    enterprise: {
      dailyMinutes: 'unlimited',
      maxRecordingsStored: 'unlimited',
      audioQuality: 'studio',
      speechToTextQuota: 'unlimited',
      exportFormats: ['srt', 'vtt', 'txt', 'json', 'pdf', 'docx'],
      features: [
        'ai_transcript',
        'speed_control',
        'loop_playback',
        'difficulty_analysis',
        'progress_tracking',
        'advanced_analytics',
        'pronunciation_scoring',
        'custom_vocabulary',
        'offline_mode',
        'ai_feedback',
        'custom_content',
        'team_sharing',
        'api_access',
        'white_label'
      ]
    }
  };

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private eventEmitter: EventEmitter,
    private subscriptionService: SubscriptionService,
    private stripeService: StripeService
  ) {
    this.setupEventListeners();
  }

  /**
   * Get shadowing features for a user's plan
   */
  async getShadowingFeatures(userId: string): Promise<ShadowingPlanLimits> {
    try {
      const subscription = await this.subscriptionService.getUserSubscription(userId);
      const planId = subscription.plan.id;

      return this.SHADOWING_PLANS[planId] || this.SHADOWING_PLANS.free;
    } catch (error) {
      logger.error('Failed to get shadowing features', error as Error);
      return this.SHADOWING_PLANS.free;
    }
  }

  /**
   * Track usage for billing purposes
   */
  async trackUsage(userId: string, type: 'minutes' | 'recordings' | 'speech_to_text', amount: number = 1): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${this.CACHE_PREFIX}usage:${userId}:${today}`;

      // Get current usage
      const currentUsage = await this.getUsageForToday(userId);

      // Update usage based on type
      switch (type) {
        case 'minutes':
          currentUsage.minutesUsed += amount;
          break;
        case 'recordings':
          currentUsage.recordingsCreated += amount;
          break;
        case 'speech_to_text':
          currentUsage.speechToTextCalls += amount;
          break;
      }

      // Save to cache
      await this.redis.setex(key, this.USAGE_WINDOW, JSON.stringify(currentUsage));

      // Also save to database for billing history
      await this.saveUsageToDatabase(currentUsage);

      // Check limits and emit events if needed
      await this.checkUsageLimits(userId, type, currentUsage);
    } catch (error) {
      logger.error('Failed to track usage', error as Error);
      throw error;
    }
  }

  /**
   * Check if user can use a feature based on their limits
   */
  async canUseFeature(userId: string, feature: 'practice' | 'recording' | 'speech_to_text'): Promise<{
    allowed: boolean;
    reason?: string;
    limit?: number | string;
    used?: number;
    upgradeUrl?: string;
  }> {
    try {
      const features = await this.getShadowingFeatures(userId);
      const usage = await this.getUsageForToday(userId);

      switch (feature) {
        case 'practice':
          if (features.dailyMinutes === 'unlimited') {
            return { allowed: true };
          }

          const minutesRemaining = features.dailyMinutes - usage.minutesUsed;
          if (minutesRemaining <= 0) {
            return {
              allowed: false,
              reason: 'Daily practice limit reached',
              limit: features.dailyMinutes,
              used: usage.minutesUsed,
              upgradeUrl: '/pricing'
            };
          }

          return {
            allowed: true,
            limit: features.dailyMinutes,
            used: usage.minutesUsed
          };

        case 'recording':
          // Check stored recordings count
          const recordingsCount = await this.getStoredRecordingsCount(userId);

          if (features.maxRecordingsStored === 'unlimited') {
            return { allowed: true };
          }

          if (recordingsCount >= features.maxRecordingsStored) {
            return {
              allowed: false,
              reason: 'Maximum recordings limit reached',
              limit: features.maxRecordingsStored,
              used: recordingsCount,
              upgradeUrl: '/pricing'
            };
          }

          return {
            allowed: true,
            limit: features.maxRecordingsStored,
            used: recordingsCount
          };

        case 'speech_to_text':
          if (features.speechToTextQuota === 'unlimited') {
            return { allowed: true };
          }

          if (usage.speechToTextCalls >= features.speechToTextQuota) {
            return {
              allowed: false,
              reason: 'Speech-to-text quota exceeded',
              limit: features.speechToTextQuota,
              used: usage.speechToTextCalls,
              upgradeUrl: '/pricing'
            };
          }

          return {
            allowed: true,
            limit: features.speechToTextQuota,
            used: usage.speechToTextCalls
          };

        default:
          return { allowed: true };
      }
    } catch (error) {
      logger.error('Failed to check feature availability', error as Error);
      return {
        allowed: false,
        reason: 'Error checking feature availability'
      };
    }
  }

  /**
   * Get usage statistics for billing period
   */
  async getUsageStats(userId: string, startDate?: Date, endDate?: Date): Promise<{
    period: { start: Date; end: Date };
    totals: {
      minutesPracticed: number;
      recordingsCreated: number;
      speechToTextCalls: number;
      daysActive: number;
    };
    daily: UsageData[];
    costEstimate?: number;
  }> {
    try {
      // Default to current billing period
      const subscription = await this.subscriptionService.getUserSubscription(userId);
      const start = startDate || new Date(subscription.subscription.current_period_start * 1000);
      const end = endDate || new Date(subscription.subscription.current_period_end * 1000);

      // Get usage data from database
      const usageData = await this.prisma.$queryRaw<UsageData[]>`
        SELECT
          DATE(created_at) as date,
          SUM(CASE WHEN type = 'minutes' THEN amount ELSE 0 END) as minutes_used,
          SUM(CASE WHEN type = 'recordings' THEN amount ELSE 0 END) as recordings_created,
          SUM(CASE WHEN type = 'speech_to_text' THEN amount ELSE 0 END) as speech_to_text_calls
        FROM usage_tracking
        WHERE user_id = ${userId}
          AND created_at >= ${start}
          AND created_at <= ${end}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      // Calculate totals
      const totals = usageData.reduce((acc, day) => ({
        minutesPracticed: acc.minutesPracticed + (day.minutesUsed || 0),
        recordingsCreated: acc.recordingsCreated + (day.recordingsCreated || 0),
        speechToTextCalls: acc.speechToTextCalls + (day.speechToTextCalls || 0),
        daysActive: acc.daysActive + 1
      }), {
        minutesPracticed: 0,
        recordingsCreated: 0,
        speechToTextCalls: 0,
        daysActive: 0
      });

      // Calculate cost estimate for metered features
      const costEstimate = await this.calculateUsageCost(totals, subscription.plan.id);

      return {
        period: { start, end },
        totals,
        daily: usageData,
        costEstimate
      };
    } catch (error) {
      logger.error('Failed to get usage stats', error as Error);
      throw error;
    }
  }

  /**
   * Handle subscription plan changes
   */
  async handlePlanChange(userId: string, oldPlanId: string, newPlanId: string): Promise<void> {
    try {
      logger.info('Handling plan change for YouTube Shadowing', {
        userId,
        oldPlanId,
        newPlanId
      });

      // Get new plan features
      const newFeatures = this.SHADOWING_PLANS[newPlanId];

      // If downgrading, check if user needs to reduce stored content
      if (this.isDowngrade(oldPlanId, newPlanId)) {
        await this.handleDowngrade(userId, newFeatures);
      }

      // Clear usage cache to reset limits
      await this.clearUsageCache(userId);

      // Emit plan change event
      this.eventEmitter.emit('shadowing-billing:plan-changed', {
        userId,
        oldPlan: oldPlanId,
        newPlan: newPlanId,
        features: newFeatures
      });

      // Send notification
      this.eventEmitter.emit('notification:send', {
        userId,
        type: 'plan_changed',
        title: 'Plan Updated',
        message: `Your YouTube Shadowing features have been updated to the ${newPlanId} plan.`,
        data: {
          oldPlan: oldPlanId,
          newPlan: newPlanId
        }
      });
    } catch (error) {
      logger.error('Failed to handle plan change', error as Error);
      throw error;
    }
  }

  /**
   * Create usage-based charges for metered features
   */
  async createUsageCharges(userId: string): Promise<void> {
    try {
      const subscription = await this.subscriptionService.getUserSubscription(userId);

      // Only create charges for metered billing plans
      if (!this.hasMeteredBilling(subscription.plan.id)) {
        return;
      }

      // Get usage for the billing period
      const usage = await this.getUsageStats(userId);

      // Create Stripe usage record
      if (usage.costEstimate && usage.costEstimate > 0) {
        await this.stripeService.createUsageRecord(
          subscription.subscription.id,
          {
            quantity: Math.round(usage.costEstimate * 100), // Convert to cents
            timestamp: Math.floor(Date.now() / 1000),
            action: 'set'
          }
        );
      }
    } catch (error) {
      logger.error('Failed to create usage charges', error as Error);
      throw error;
    }
  }

  // Private helper methods

  private async getUsageForToday(userId: string): Promise<UsageData> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${this.CACHE_PREFIX}usage:${userId}:${today}`;

    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    return {
      userId,
      date: today,
      minutesUsed: 0,
      recordingsCreated: 0,
      speechToTextCalls: 0
    };
  }

  private async saveUsageToDatabase(usage: UsageData): Promise<void> {
    // This would save to a usage_tracking table
    // Implementation depends on your database schema
  }

  private async checkUsageLimits(userId: string, type: string, usage: UsageData): Promise<void> {
    const features = await this.getShadowingFeatures(userId);

    // Check if user is approaching or exceeding limits
    if (type === 'minutes' && features.dailyMinutes !== 'unlimited') {
      const percentUsed = (usage.minutesUsed / features.dailyMinutes) * 100;

      if (percentUsed >= 100) {
        this.eventEmitter.emit('shadowing-billing:limit-exceeded', {
          userId,
          limitType: 'daily_minutes',
          used: usage.minutesUsed,
          limit: features.dailyMinutes
        });
      } else if (percentUsed >= 80) {
        this.eventEmitter.emit('shadowing-billing:limit-warning', {
          userId,
          limitType: 'daily_minutes',
          used: usage.minutesUsed,
          limit: features.dailyMinutes,
          percentUsed
        });
      }
    }
  }

  private async getStoredRecordingsCount(userId: string): Promise<number> {
    return await this.prisma.recording.count({
      where: { userId }
    });
  }

  private isDowngrade(oldPlanId: string, newPlanId: string): boolean {
    const planHierarchy = ['free', 'starter', 'pro', 'enterprise'];
    return planHierarchy.indexOf(newPlanId) < planHierarchy.indexOf(oldPlanId);
  }

  private async handleDowngrade(userId: string, newFeatures: ShadowingPlanLimits): Promise<void> {
    // Handle recording limits
    if (newFeatures.maxRecordingsStored !== 'unlimited') {
      const recordingsCount = await this.getStoredRecordingsCount(userId);

      if (recordingsCount > newFeatures.maxRecordingsStored) {
        // Mark old recordings for deletion
        const recordingsToDelete = recordingsCount - newFeatures.maxRecordingsStored;

        this.eventEmitter.emit('shadowing-billing:cleanup-required', {
          userId,
          type: 'recordings',
          currentCount: recordingsCount,
          maxAllowed: newFeatures.maxRecordingsStored,
          toDelete: recordingsToDelete
        });
      }
    }
  }

  private async clearUsageCache(userId: string): Promise<void> {
    const pattern = `${this.CACHE_PREFIX}usage:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private hasMeteredBilling(planId: string): boolean {
    // Enterprise plans might have usage-based billing
    return planId === 'enterprise';
  }

  private async calculateUsageCost(usage: any, planId: string): Promise<number> {
    // Calculate cost based on usage beyond plan limits
    // This is a simplified example
    if (!this.hasMeteredBilling(planId)) {
      return 0;
    }

    let cost = 0;

    // Example: $0.01 per minute over limit
    const features = this.SHADOWING_PLANS[planId];
    if (features.dailyMinutes !== 'unlimited') {
      const overage = Math.max(0, usage.minutesPracticed - (features.dailyMinutes * 30)); // Monthly
      cost += overage * 0.01;
    }

    // Example: $0.001 per speech-to-text call over limit
    if (features.speechToTextQuota !== 'unlimited') {
      const overage = Math.max(0, usage.speechToTextCalls - features.speechToTextQuota);
      cost += overage * 0.001;
    }

    return cost;
  }

  private setupEventListeners(): void {
    // Listen for practice session events
    this.eventEmitter.on('practice-session:started', async (event: any) => {
      await this.trackUsage(event.userId, 'minutes', 0); // Start tracking
    });

    this.eventEmitter.on('practice-session:ended', async (event: any) => {
      const duration = Math.ceil(event.duration / 60); // Convert to minutes
      await this.trackUsage(event.userId, 'minutes', duration);
    });

    this.eventEmitter.on('audio:recording-created', async (event: any) => {
      await this.trackUsage(event.userId, 'recordings', 1);
    });

    this.eventEmitter.on('transcript:speech-to-text', async (event: any) => {
      await this.trackUsage(event.userId, 'speech_to_text', 1);
    });

    // Listen for billing webhooks
    this.eventEmitter.on('stripe:subscription.updated', async (event: any) => {
      const { userId, oldPlan, newPlan } = event;
      if (oldPlan !== newPlan) {
        await this.handlePlanChange(userId, oldPlan, newPlan);
      }
    });
  }
}
