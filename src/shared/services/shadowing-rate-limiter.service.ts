// Rate limiting service for YouTube Shadowing endpoints

import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { RedisService } from '@shared/services/redis.service';
import { logger } from '@shared/logger';
import { AppError } from '@shared/errors';
import { SubscriptionService } from '@modules/billing/subscription.service';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetAt: Date;
}

interface PlanRateLimits {
  [endpoint: string]: {
    free: RateLimitConfig;
    starter: RateLimitConfig;
    pro: RateLimitConfig;
    enterprise: RateLimitConfig;
  };
}

@Service()
export class ShadowingRateLimiterService {
  private readonly RATE_LIMIT_PREFIX = 'rate-limit:shadowing:';

  // Define rate limits for each endpoint and plan
  private readonly RATE_LIMITS: PlanRateLimits = {
    // YouTube Integration
    'youtube:search': {
      free: { windowMs: 900000, max: 10 }, // 10 per 15 min
      starter: { windowMs: 900000, max: 30 },
      pro: { windowMs: 900000, max: 100 },
      enterprise: { windowMs: 900000, max: 1000 }
    },
    'youtube:video-info': {
      free: { windowMs: 900000, max: 20 },
      starter: { windowMs: 900000, max: 60 },
      pro: { windowMs: 900000, max: 200 },
      enterprise: { windowMs: 900000, max: 2000 }
    },

    // Transcript
    'transcript:get': {
      free: { windowMs: 900000, max: 15 },
      starter: { windowMs: 900000, max: 50 },
      pro: { windowMs: 900000, max: 200 },
      enterprise: { windowMs: 900000, max: 2000 }
    },
    'transcript:process': {
      free: { windowMs: 3600000, max: 5 }, // 5 per hour
      starter: { windowMs: 3600000, max: 20 },
      pro: { windowMs: 3600000, max: 100 },
      enterprise: { windowMs: 3600000, max: 1000 }
    },
    'transcript:speech-to-text': {
      free: { windowMs: 3600000, max: 10 },
      starter: { windowMs: 3600000, max: 50 },
      pro: { windowMs: 3600000, max: 200 },
      enterprise: { windowMs: 3600000, max: 2000 }
    },

    // Practice Session
    'practice:create': {
      free: { windowMs: 3600000, max: 5 },
      starter: { windowMs: 3600000, max: 20 },
      pro: { windowMs: 3600000, max: 100 },
      enterprise: { windowMs: 3600000, max: 1000 }
    },
    'practice:state': {
      free: { windowMs: 60000, max: 60 }, // 60 per minute
      starter: { windowMs: 60000, max: 120 },
      pro: { windowMs: 60000, max: 300 },
      enterprise: { windowMs: 60000, max: 1000 }
    },

    // Audio Processing
    'audio:upload': {
      free: { windowMs: 900000, max: 10 },
      starter: { windowMs: 900000, max: 30 },
      pro: { windowMs: 900000, max: 100 },
      enterprise: { windowMs: 900000, max: 1000 }
    },
    'audio:process': {
      free: { windowMs: 900000, max: 10 },
      starter: { windowMs: 900000, max: 30 },
      pro: { windowMs: 900000, max: 100 },
      enterprise: { windowMs: 900000, max: 1000 }
    },

    // Learning Progress
    'progress:track': {
      free: { windowMs: 60000, max: 100 },
      starter: { windowMs: 60000, max: 200 },
      pro: { windowMs: 60000, max: 500 },
      enterprise: { windowMs: 60000, max: 2000 }
    },
    'progress:analytics': {
      free: { windowMs: 900000, max: 20 },
      starter: { windowMs: 900000, max: 50 },
      pro: { windowMs: 900000, max: 200 },
      enterprise: { windowMs: 900000, max: 1000 }
    },
    'progress:report': {
      free: { windowMs: 3600000, max: 2 },
      starter: { windowMs: 3600000, max: 10 },
      pro: { windowMs: 3600000, max: 50 },
      enterprise: { windowMs: 3600000, max: 500 }
    }
  };

  // Global rate limits (apply to all users)
  private readonly GLOBAL_LIMITS: { [key: string]: RateLimitConfig } = {
    'api:global': { windowMs: 60000, max: 10000 }, // 10k requests per minute globally
    'auth:login': { windowMs: 900000, max: 5 }, // 5 login attempts per 15 min
    'auth:register': { windowMs: 3600000, max: 3 }, // 3 registrations per hour per IP
    'file:upload': { windowMs: 300000, max: 50 } // 50 uploads per 5 min
  };

  constructor(
    private redis: RedisService,
    private subscriptionService: SubscriptionService
  ) {}

  /**
   * Create rate limiter middleware for specific endpoint
   */
  createLimiter(endpointKey: string, customLimits?: Partial<PlanRateLimits[string]>) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const ip = request.ip;

        // Get user's plan
        let planId = 'free';
        if (userId) {
          const subscription = await this.subscriptionService.getUserSubscription(userId);
          planId = subscription.plan.id;
        }

        // Get rate limit config for this endpoint and plan
        const limits = customLimits || this.RATE_LIMITS[endpointKey];
        if (!limits) {
          logger.warn('No rate limit configured for endpoint', { endpointKey });
          return;
        }

        const config = limits[planId as keyof typeof limits] || limits.free;

        // Generate key
        const key = this.generateKey(endpointKey, userId || ip);

        // Check rate limit
        const result = await this.checkRateLimit(key, config);

        // Set headers
        reply.headers({
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetAt.toISOString(),
          'X-RateLimit-Plan': planId
        });

        // If limit exceeded
        if (result.remaining < 0) {
          const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);

          reply.headers({
            'Retry-After': retryAfter.toString()
          });

          // Log rate limit exceeded
          logger.warn('Rate limit exceeded', {
            endpointKey,
            userId,
            ip,
            plan: planId,
            limit: result.limit,
            window: config.windowMs
          });

          throw new AppError(
            config.message || 'Too many requests, please try again later.',
            429,
            'RATE_LIMIT_EXCEEDED',
            {
              limit: result.limit,
              resetAt: result.resetAt,
              retryAfter,
              upgradeUrl: planId !== 'enterprise' ? '/billing/plans' : undefined
            }
          );
        }
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        logger.error('Rate limiter error', error as Error);
        // Don't block request on rate limiter errors
      }
    };
  }

  /**
   * Check rate limit for a key
   */
  async checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
    const now = Date.now();
    const window = config.windowMs;
    const limit = config.max;

    // Use Redis sorted set for sliding window
    const windowStart = now - window;
    const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;

    // Remove old entries
    await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);

    // Count requests in current window
    const current = await this.redis.zcard(redisKey);

    // Add current request
    await this.redis.zadd(redisKey, now, `${now}-${Math.random()}`);

    // Set expiry
    await this.redis.expire(redisKey, Math.ceil(window / 1000));

    // Calculate reset time
    const oldestRequest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetAt = oldestRequest.length > 0
      ? new Date(parseInt(oldestRequest[1]) + window)
      : new Date(now + window);

    return {
      limit,
      current: current + 1,
      remaining: limit - current - 1,
      resetAt
    };
  }

  /**
   * Create global rate limiter
   */
  createGlobalLimiter(limitKey: string) {
    const config = this.GLOBAL_LIMITS[limitKey];
    if (!config) {
      logger.warn('No global limit configured', { limitKey });
      return (req: FastifyRequest, reply: FastifyReply) => {};
    }

    return async (request: FastifyRequest, reply: FastifyReply) => {
      const key = this.generateKey(`global:${limitKey}`, request.ip);
      const result = await this.checkRateLimit(key, config);

      if (result.remaining < 0) {
        throw new AppError(
          'Global rate limit exceeded. Please try again later.',
          429,
          'GLOBAL_RATE_LIMIT_EXCEEDED'
        );
      }
    };
  }

  /**
   * Reset rate limit for a user/key
   */
  async resetRateLimit(endpointKey: string, userId: string): Promise<void> {
    const key = this.generateKey(endpointKey, userId);
    const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;
    await this.redis.del(redisKey);

    logger.info('Rate limit reset', { endpointKey, userId });
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(endpointKey: string, userId: string): Promise<RateLimitInfo> {
    // Get user's plan
    const subscription = await this.subscriptionService.getUserSubscription(userId);
    const planId = subscription.plan.id;

    // Get config
    const limits = this.RATE_LIMITS[endpointKey];
    if (!limits) {
      throw new AppError('Unknown endpoint', 404);
    }

    const config = limits[planId as keyof typeof limits] || limits.free;
    const key = this.generateKey(endpointKey, userId);
    const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;

    // Get current count
    const now = Date.now();
    const windowStart = now - config.windowMs;

    await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);
    const current = await this.redis.zcard(redisKey);

    // Calculate reset time
    const oldestRequest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetAt = oldestRequest.length > 0
      ? new Date(parseInt(oldestRequest[1]) + config.windowMs)
      : new Date(now + config.windowMs);

    return {
      limit: config.max,
      current,
      remaining: Math.max(0, config.max - current),
      resetAt
    };
  }

  /**
   * Get all rate limits for a user's plan
   */
  async getAllLimitsForUser(userId: string): Promise<{
    plan: string;
    limits: { [endpoint: string]: RateLimitConfig };
  }> {
    const subscription = await this.subscriptionService.getUserSubscription(userId);
    const planId = subscription.plan.id;

    const limits: { [endpoint: string]: RateLimitConfig } = {};

    for (const [endpoint, planLimits] of Object.entries(this.RATE_LIMITS)) {
      limits[endpoint] = planLimits[planId as keyof typeof planLimits] || planLimits.free;
    }

    return {
      plan: planId,
      limits
    };
  }

  /**
   * Generate cache key
   */
  private generateKey(endpoint: string, identifier: string): string {
    return `${endpoint}:${identifier}`;
  }

  /**
   * Apply rate limiting to all shadowing routes
   */
  applyShadowingRateLimits(app: any): void {
    // YouTube Integration routes
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const path = request.routerPath;

      const routeToEndpoint: { [key: string]: string } = {
        '/api/youtube-integration/search': 'youtube:search',
        '/api/youtube-integration/video/:videoId': 'youtube:video-info',
        '/api/transcript/:videoId': 'transcript:get',
        '/api/transcript/:videoId/process': 'transcript:process',
        '/api/transcript/speech-to-text': 'transcript:speech-to-text',
        '/api/practice-session/create': 'practice:create',
        '/api/practice-session/:sessionId/state': 'practice:state',
        '/api/audio/upload': 'audio:upload',
        '/api/audio/:recordingId/process': 'audio:process',
        '/api/learning-progress/track': 'progress:track',
        '/api/learning-progress/analytics': 'progress:analytics',
        '/api/learning-progress/report': 'progress:report'
      };

      const endpointKey = routeToEndpoint[path];
      if (endpointKey) {
        const limiter = this.createLimiter(endpointKey);
        await limiter(request, reply);
      }
    });
  }
}
