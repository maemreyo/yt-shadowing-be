// Webhook event configuration for YouTube Shadowing

import { Service } from 'typedi';
import { WebhookService } from '@modules/webhook/webhook.service';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';
import * as crypto from 'crypto';

export interface WebhookEventConfig {
  event: string;
  name: string;
  description: string;
  category: string;
  schema: any; // JSON Schema
  retryPolicy: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  transformPayload?: (data: any) => any;
}

export interface WebhookSubscriptionOptions {
  events: string[];
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  filters?: Record<string, any>;
}

@Service()
export class ShadowingWebhookEvents {
  // Webhook event definitions
  private readonly WEBHOOK_EVENTS: Record<string, WebhookEventConfig> = {
    // Practice Session Events
    'practice.session.started': {
      event: 'practice.session.started',
      name: 'Practice Session Started',
      description: 'Triggered when a user starts a new practice session',
      category: 'practice',
      schema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          userId: { type: 'string' },
          videoId: { type: 'string' },
          videoTitle: { type: 'string' },
          videoDuration: { type: 'number' },
          language: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          settings: {
            type: 'object',
            properties: {
              playbackSpeed: { type: 'number' },
              loopCount: { type: 'number' },
              autoPlay: { type: 'boolean' }
            }
          }
        },
        required: ['sessionId', 'userId', 'videoId', 'startTime']
      },
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 60000,
        backoffMultiplier: 2
      }
    },

    'practice.session.completed': {
      event: 'practice.session.completed',
      name: 'Practice Session Completed',
      description: 'Triggered when a practice session is completed',
      category: 'practice',
      schema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          userId: { type: 'string' },
          videoId: { type: 'string' },
          duration: { type: 'number' },
          completedSentences: { type: 'number' },
          totalSentences: { type: 'number' },
          completionRate: { type: 'number' },
          averageScore: { type: 'number' },
          endTime: { type: 'string', format: 'date-time' }
        }
      },
      retryPolicy: {
        maxAttempts: 5,
        initialDelay: 2000,
        maxDelay: 120000,
        backoffMultiplier: 2
      }
    },

    // Audio Recording Events
    'audio.recording.completed': {
      event: 'audio.recording.completed',
      name: 'Audio Recording Completed',
      description: 'Triggered when audio recording is processed',
      category: 'audio',
      schema: {
        type: 'object',
        properties: {
          recordingId: { type: 'string' },
          userId: { type: 'string' },
          sessionId: { type: 'string' },
          sentenceIndex: { type: 'number' },
          duration: { type: 'number' },
          fileSize: { type: 'number' },
          audioUrl: { type: 'string' },
          processedAt: { type: 'string', format: 'date-time' }
        }
      },
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    },

    'audio.analysis.completed': {
      event: 'audio.analysis.completed',
      name: 'Audio Analysis Completed',
      description: 'Triggered when pronunciation analysis is complete',
      category: 'audio',
      schema: {
        type: 'object',
        properties: {
          recordingId: { type: 'string' },
          userId: { type: 'string' },
          scores: {
            type: 'object',
            properties: {
              overall: { type: 'number' },
              pronunciation: { type: 'number' },
              fluency: { type: 'number' },
              timing: { type: 'number' }
            }
          },
          feedback: { type: 'string' },
          analyzedAt: { type: 'string', format: 'date-time' }
        }
      },
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2
      }
    },

    // Progress Events
    'progress.milestone.achieved': {
      event: 'progress.milestone.achieved',
      name: 'Milestone Achieved',
      description: 'Triggered when user achieves a learning milestone',
      category: 'progress',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          milestoneType: { type: 'string' },
          milestoneValue: { type: 'number' },
          achievedAt: { type: 'string', format: 'date-time' },
          reward: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              value: { type: ['string', 'number'] }
            }
          }
        }
      },
      retryPolicy: {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 60000,
        backoffMultiplier: 2
      }
    },

    'progress.report.generated': {
      event: 'progress.report.generated',
      name: 'Progress Report Generated',
      description: 'Triggered when a progress report is generated',
      category: 'progress',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          reportId: { type: 'string' },
          reportType: { type: 'string' },
          period: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' }
            }
          },
          summary: {
            type: 'object',
            properties: {
              totalSessions: { type: 'number' },
              totalMinutes: { type: 'number' },
              averageScore: { type: 'number' },
              improvement: { type: 'number' }
            }
          },
          reportUrl: { type: 'string' }
        }
      },
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    },

    // Subscription Events
    'subscription.limit.exceeded': {
      event: 'subscription.limit.exceeded',
      name: 'Subscription Limit Exceeded',
      description: 'Triggered when user exceeds plan limits',
      category: 'subscription',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          limitType: { type: 'string' },
          limit: { type: ['number', 'string'] },
          used: { type: 'number' },
          plan: { type: 'string' },
          exceededAt: { type: 'string', format: 'date-time' }
        }
      },
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    },

    'subscription.upgraded': {
      event: 'subscription.upgraded',
      name: 'Subscription Upgraded',
      description: 'Triggered when user upgrades their plan',
      category: 'subscription',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          oldPlan: { type: 'string' },
          newPlan: { type: 'string' },
          upgradedAt: { type: 'string', format: 'date-time' },
          source: { type: 'string' }
        }
      },
      retryPolicy: {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 60000,
        backoffMultiplier: 2
      }
    },

    // Content Events
    'content.video.favorited': {
      event: 'content.video.favorited',
      name: 'Video Favorited',
      description: 'Triggered when user favorites a video',
      category: 'content',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          videoId: { type: 'string' },
          videoTitle: { type: 'string' },
          favoritedAt: { type: 'string', format: 'date-time' }
        }
      },
      retryPolicy: {
        maxAttempts: 2,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      }
    },

    'content.recommendation.generated': {
      event: 'content.recommendation.generated',
      name: 'Recommendations Generated',
      description: 'Triggered when new video recommendations are generated',
      category: 'content',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                videoId: { type: 'string' },
                title: { type: 'string' },
                score: { type: 'number' },
                reason: { type: 'string' }
              }
            }
          },
          generatedAt: { type: 'string', format: 'date-time' }
        }
      },
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    }
  };

  constructor(
    private webhookService: WebhookService,
    private eventEmitter: EventEmitter
  ) {
    this.registerWebhookEvents();
    this.setupEventListeners();
  }

  /**
   * Register all webhook events
   */
  private async registerWebhookEvents(): Promise<void> {
    try {
      for (const [eventKey, config] of Object.entries(this.WEBHOOK_EVENTS)) {
        await this.webhookService.registerEvent({
          event: config.event,
          name: config.name,
          description: config.description,
          category: config.category,
          schema: config.schema,
          module: 'youtube_shadowing'
        });
      }

      logger.info('YouTube Shadowing webhook events registered', {
        count: Object.keys(this.WEBHOOK_EVENTS).length
      });
    } catch (error) {
      logger.error('Failed to register webhook events', error as Error);
    }
  }

  /**
   * Setup internal event listeners
   */
  private setupEventListeners(): void {
    // Practice session events
    this.eventEmitter.on('practice-session:started', (data) => {
      this.triggerWebhook('practice.session.started', data);
    });

    this.eventEmitter.on('practice-session:completed', (data) => {
      this.triggerWebhook('practice.session.completed', data);
    });

    // Audio events
    this.eventEmitter.on('audio:recording-completed', (data) => {
      this.triggerWebhook('audio.recording.completed', data);
    });

    this.eventEmitter.on('audio:analysis-completed', (data) => {
      this.triggerWebhook('audio.analysis.completed', data);
    });

    // Progress events
    this.eventEmitter.on('learning-progress.milestone.achieved', (data) => {
      this.triggerWebhook('progress.milestone.achieved', data);
    });

    this.eventEmitter.on('learning-progress.report.generated', (data) => {
      this.triggerWebhook('progress.report.generated', data);
    });

    // Subscription events
    this.eventEmitter.on('shadowing-billing:limit-exceeded', (data) => {
      this.triggerWebhook('subscription.limit.exceeded', data);
    });

    this.eventEmitter.on('shadowing-billing:plan-changed', (data) => {
      if (this.isPlanUpgrade(data.oldPlan, data.newPlan)) {
        this.triggerWebhook('subscription.upgraded', data);
      }
    });

    // Content events
    this.eventEmitter.on('content:video-favorited', (data) => {
      this.triggerWebhook('content.video.favorited', data);
    });

    this.eventEmitter.on('content:recommendations-generated', (data) => {
      this.triggerWebhook('content.recommendation.generated', data);
    });
  }

  /**
   * Trigger webhook for event
   */
  private async triggerWebhook(eventType: string, data: any): Promise<void> {
    try {
      const config = this.WEBHOOK_EVENTS[eventType];
      if (!config) {
        logger.error('Unknown webhook event type', { eventType });
        return;
      }

      // Transform payload if needed
      const payload = config.transformPayload ? config.transformPayload(data) : data;

      // Add metadata
      const enrichedPayload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload,
        metadata: {
          version: '1.0',
          module: 'youtube_shadowing'
        }
      };

      // Trigger webhook
      await this.webhookService.trigger(eventType, enrichedPayload, {
        retryPolicy: config.retryPolicy
      });

      logger.debug('Webhook triggered', {
        event: eventType,
        dataKeys: Object.keys(payload)
      });
    } catch (error) {
      logger.error('Failed to trigger webhook', {
        event: eventType,
        error: (error as Error).message
      });
    }
  }

  /**
   * Create webhook subscription
   */
  async createSubscription(
    userId: string,
    options: WebhookSubscriptionOptions
  ): Promise<{
    id: string;
    secret: string;
    verificationToken: string;
  }> {
    // Validate events
    const validEvents = options.events.filter(event =>
      Object.keys(this.WEBHOOK_EVENTS).includes(event)
    );

    if (validEvents.length === 0) {
      throw new Error('No valid events specified');
    }

    // Generate secret if not provided
    const secret = options.secret || this.generateWebhookSecret();

    // Create subscription
    const subscription = await this.webhookService.createSubscription({
      userId,
      url: options.url,
      events: validEvents,
      secret,
      headers: options.headers,
      filters: options.filters,
      module: 'youtube_shadowing',
      active: true
    });

    return {
      id: subscription.id,
      secret,
      verificationToken: subscription.verificationToken
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Get webhook event catalog
   */
  getEventCatalog(): Array<{
    event: string;
    name: string;
    description: string;
    category: string;
    schema: any;
  }> {
    return Object.values(this.WEBHOOK_EVENTS).map(config => ({
      event: config.event,
      name: config.name,
      description: config.description,
      category: config.category,
      schema: config.schema
    }));
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(
    userId?: string,
    timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    totalDelivered: number;
    totalFailed: number;
    averageDeliveryTime: number;
    eventBreakdown: Record<string, number>;
    errorRate: number;
  }> {
    // This would query webhook delivery logs
    return {
      totalDelivered: 0,
      totalFailed: 0,
      averageDeliveryTime: 0,
      eventBreakdown: {},
      errorRate: 0
    };
  }

  /**
   * Retry failed webhook
   */
  async retryWebhook(webhookId: string): Promise<void> {
    await this.webhookService.retry(webhookId);
  }

  // Helper methods

  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private isPlanUpgrade(oldPlan: string, newPlan: string): boolean {
    const planHierarchy = ['free', 'starter', 'pro', 'enterprise'];
    return planHierarchy.indexOf(newPlan) > planHierarchy.indexOf(oldPlan);
  }

  /**
   * Webhook endpoint handler example
   */
  async handleWebhookEndpoint(request: any): Promise<{
    received: boolean;
    message?: string;
  }> {
    try {
      const signature = request.headers['x-webhook-signature'];
      const secret = request.headers['x-webhook-secret'];
      const payload = JSON.stringify(request.body);

      // Verify signature
      if (!this.verifyWebhookSignature(payload, signature, secret)) {
        return {
          received: false,
          message: 'Invalid signature'
        };
      }

      // Process webhook
      const { event, data } = request.body;

      logger.info('Webhook received', {
        event,
        dataKeys: Object.keys(data)
      });

      // Handle specific events if needed
      switch (event) {
        case 'practice.session.completed':
          // Could trigger additional processing
          break;
        case 'progress.milestone.achieved':
          // Could send celebration email
          break;
      }

      return {
        received: true
      };
    } catch (error) {
      logger.error('Webhook processing failed', error as Error);
      return {
        received: false,
        message: 'Processing failed'
      };
    }
  }
}
