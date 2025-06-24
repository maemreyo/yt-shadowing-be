// Service to handle upgrade prompts when limits are reached

import { Service } from 'typedi';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';
import { NotificationService } from '@modules/notification';
import { ShadowingBillingService } from './shadowing-billing.service';
import { SubscriptionService } from './subscription.service';

export interface UpgradePrompt {
  type: 'modal' | 'banner' | 'notification' | 'inline';
  trigger: string;
  title: string;
  message: string;
  currentPlan: string;
  suggestedPlan: string;
  benefits: string[];
  ctaText: string;
  ctaUrl: string;
  dismissible: boolean;
  priority: 'low' | 'medium' | 'high';
}

@Service()
export class UpgradePromptService {
  private readonly PROMPT_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours
  private lastPromptTime = new Map<string, number>();

  constructor(
    private eventEmitter: EventEmitter,
    private notificationService: NotificationService,
    private shadowingBillingService: ShadowingBillingService,
    private subscriptionService: SubscriptionService
  ) {
    this.setupEventListeners();
  }

  /**
   * Generate an upgrade prompt based on the limit exceeded
   */
  async generateUpgradePrompt(
    userId: string,
    limitType: string,
    context?: any
  ): Promise<UpgradePrompt | null> {
    try {
      // Check cooldown
      if (!this.shouldShowPrompt(userId, limitType)) {
        return null;
      }

      const subscription = await this.subscriptionService.getUserSubscription(userId);
      const currentPlan = subscription.plan.id;

      // Don't show prompts to enterprise users
      if (currentPlan === 'enterprise') {
        return null;
      }

      const prompt = await this.createPromptForLimit(limitType, currentPlan, context);

      if (prompt) {
        // Record prompt time
        this.lastPromptTime.set(`${userId}:${limitType}`, Date.now());

        // Emit event for tracking
        this.eventEmitter.emit('billing:upgrade-prompt-shown', {
          userId,
          limitType,
          currentPlan: prompt.currentPlan,
          suggestedPlan: prompt.suggestedPlan,
          trigger: prompt.trigger
        });
      }

      return prompt;
    } catch (error) {
      logger.error('Failed to generate upgrade prompt', error as Error);
      return null;
    }
  }

  /**
   * Handle limit exceeded events
   */
  async handleLimitExceeded(userId: string, limitType: string, details: any): Promise<void> {
    try {
      const prompt = await this.generateUpgradePrompt(userId, limitType, details);

      if (!prompt) {
        return;
      }

      // Send different types of prompts based on priority
      switch (prompt.priority) {
        case 'high':
          // Show modal immediately
          this.eventEmitter.emit('ui:show-modal', {
            userId,
            type: 'upgrade-prompt',
            data: prompt
          });
          break;

        case 'medium':
          // Send notification
          await this.notificationService.send({
            userId,
            type: 'upgrade_prompt',
            title: prompt.title,
            message: prompt.message,
            data: {
              prompt,
              ctaUrl: prompt.ctaUrl
            }
          });
          break;

        case 'low':
          // Just log for now, could show banner later
          logger.info('Low priority upgrade prompt generated', {
            userId,
            limitType
          });
          break;
      }
    } catch (error) {
      logger.error('Failed to handle limit exceeded', error as Error);
    }
  }

  /**
   * Create specific prompts for different limit types
   */
  private async createPromptForLimit(
    limitType: string,
    currentPlan: string,
    context?: any
  ): Promise<UpgradePrompt | null> {
    const planUpgrades: Record<string, string> = {
      free: 'starter',
      starter: 'pro',
      pro: 'enterprise'
    };

    const suggestedPlan = planUpgrades[currentPlan];
    if (!suggestedPlan) {
      return null;
    }

    const prompts: Record<string, () => UpgradePrompt> = {
      daily_minutes: () => ({
        type: 'modal',
        trigger: 'daily_minutes_exceeded',
        title: '🕒 Daily Practice Limit Reached',
        message: `You've used all your daily practice minutes! Upgrade to ${this.getPlanDisplayName(suggestedPlan)} for ${this.getMinutesDisplay(suggestedPlan)} practice time.`,
        currentPlan,
        suggestedPlan,
        benefits: this.getBenefitsForUpgrade(currentPlan, suggestedPlan, 'minutes'),
        ctaText: `Upgrade to ${this.getPlanDisplayName(suggestedPlan)}`,
        ctaUrl: `/billing/upgrade?plan=${suggestedPlan}&ref=minutes_limit`,
        dismissible: true,
        priority: 'high'
      }),

      recordings_limit: () => ({
        type: 'banner',
        trigger: 'recordings_storage_full',
        title: '💾 Recording Storage Full',
        message: `You've reached your recording storage limit. Upgrade to store unlimited recordings and never lose your practice history.`,
        currentPlan,
        suggestedPlan,
        benefits: this.getBenefitsForUpgrade(currentPlan, suggestedPlan, 'recordings'),
        ctaText: 'Get More Storage',
        ctaUrl: `/billing/upgrade?plan=${suggestedPlan}&ref=recordings_limit`,
        dismissible: true,
        priority: 'medium'
      }),

      speech_to_text_quota: () => ({
        type: 'notification',
        trigger: 'speech_quota_exceeded',
        title: '🎤 Speech-to-Text Quota Reached',
        message: `You've used your monthly speech-to-text quota. Upgrade for ${this.getSpeechQuotaDisplay(suggestedPlan)} transcriptions.`,
        currentPlan,
        suggestedPlan,
        benefits: this.getBenefitsForUpgrade(currentPlan, suggestedPlan, 'speech'),
        ctaText: 'Increase Quota',
        ctaUrl: `/billing/upgrade?plan=${suggestedPlan}&ref=speech_quota`,
        dismissible: true,
        priority: 'medium'
      }),

      feature_locked: () => ({
        type: 'inline',
        trigger: 'feature_access_denied',
        title: '🔒 Premium Feature',
        message: `This feature is available on ${this.getPlanDisplayName(suggestedPlan)} and above. Upgrade to unlock advanced features.`,
        currentPlan,
        suggestedPlan,
        benefits: this.getBenefitsForUpgrade(currentPlan, suggestedPlan, 'features'),
        ctaText: 'Unlock Feature',
        ctaUrl: `/billing/upgrade?plan=${suggestedPlan}&ref=feature_locked&feature=${context?.feature}`,
        dismissible: false,
        priority: 'low'
      })
    };

    const promptCreator = prompts[limitType];
    return promptCreator ? promptCreator() : null;
  }

  /**
   * Get benefits for upgrading from one plan to another
   */
  private getBenefitsForUpgrade(
    fromPlan: string,
    toPlan: string,
    focus: 'minutes' | 'recordings' | 'speech' | 'features'
  ): string[] {
    const benefits: Record<string, string[]> = {
      'free-starter': [
        '✅ 120 minutes daily practice (4x more!)',
        '✅ Store up to 50 recordings',
        '✅ Export in multiple formats',
        '✅ Basic progress analytics',
        '✅ Priority support'
      ],
      'starter-pro': [
        '✅ Unlimited daily practice time',
        '✅ Unlimited recording storage',
        '✅ AI-powered transcriptions',
        '✅ Pronunciation scoring',
        '✅ Advanced analytics & reports',
        '✅ Export in all formats'
      ],
      'pro-enterprise': [
        '✅ Studio quality audio',
        '✅ Unlimited speech-to-text',
        '✅ AI feedback & coaching',
        '✅ Custom vocabulary lists',
        '✅ Team collaboration',
        '✅ API access',
        '✅ White-label options',
        '✅ Dedicated support'
      ]
    };

    const key = `${fromPlan}-${toPlan}`;
    let allBenefits = benefits[key] || [];

    // Focus on specific benefits based on what triggered the upgrade
    if (focus === 'minutes') {
      allBenefits = allBenefits.filter(b =>
        b.includes('minute') || b.includes('practice') || b.includes('Unlimited')
      ).concat(allBenefits.filter(b =>
        !b.includes('minute') && !b.includes('practice') && !b.includes('Unlimited')
      ));
    }

    return allBenefits.slice(0, 5); // Show top 5 benefits
  }

  /**
   * Check if we should show a prompt (respecting cooldown)
   */
  private shouldShowPrompt(userId: string, limitType: string): boolean {
    const key = `${userId}:${limitType}`;
    const lastShown = this.lastPromptTime.get(key);

    if (!lastShown) {
      return true;
    }

    return Date.now() - lastShown > this.PROMPT_COOLDOWN;
  }

  /**
   * Get display name for plans
   */
  private getPlanDisplayName(planId: string): string {
    const names: Record<string, string> = {
      free: 'Free',
      starter: 'Starter',
      pro: 'Professional',
      enterprise: 'Enterprise'
    };
    return names[planId] || planId;
  }

  /**
   * Get minutes display for plans
   */
  private getMinutesDisplay(planId: string): string {
    const displays: Record<string, string> = {
      starter: '120 minutes daily',
      pro: 'unlimited',
      enterprise: 'unlimited'
    };
    return displays[planId] || 'more';
  }

  /**
   * Get speech quota display
   */
  private getSpeechQuotaDisplay(planId: string): string {
    const displays: Record<string, string> = {
      starter: '500',
      pro: '5,000',
      enterprise: 'unlimited'
    };
    return displays[planId] || 'more';
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for limit exceeded events
    this.eventEmitter.on('shadowing-billing:limit-exceeded', async (event: any) => {
      await this.handleLimitExceeded(event.userId, event.limitType, event);
    });

    // Listen for limit warnings (80% usage)
    this.eventEmitter.on('shadowing-billing:limit-warning', async (event: any) => {
      // Show a softer prompt for warnings
      const subscription = await this.subscriptionService.getUserSubscription(event.userId);

      if (subscription.plan.id !== 'enterprise') {
        await this.notificationService.send({
          userId: event.userId,
          type: 'usage_warning',
          title: '⚠️ Approaching Limit',
          message: `You've used ${event.percentUsed}% of your ${event.limitType.replace('_', ' ')}. Consider upgrading for unlimited access.`,
          data: {
            limitType: event.limitType,
            percentUsed: event.percentUsed,
            upgradeUrl: '/billing/plans'
          }
        });
      }
    });

    // Listen for feature access denied
    this.eventEmitter.on('shadowing:feature-access-denied', async (event: any) => {
      await this.handleLimitExceeded(event.userId, 'feature_locked', {
        feature: event.feature
      });
    });

    // Track upgrade prompt interactions
    this.eventEmitter.on('ui:upgrade-prompt-clicked', (event: any) => {
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'upgrade_prompt_clicked',
        properties: {
          prompt_type: event.promptType,
          trigger: event.trigger,
          current_plan: event.currentPlan,
          suggested_plan: event.suggestedPlan
        }
      });
    });

    this.eventEmitter.on('ui:upgrade-prompt-dismissed', (event: any) => {
      this.eventEmitter.emit('analytics:track', {
        userId: event.userId,
        event: 'upgrade_prompt_dismissed',
        properties: {
          prompt_type: event.promptType,
          trigger: event.trigger
        }
      });
    });
  }
}
