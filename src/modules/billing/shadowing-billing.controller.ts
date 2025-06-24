// API endpoints for YouTube Shadowing billing features

import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ShadowingBillingService } from './shadowing-billing.service';
import {
  CheckShadowingFeatureDTO,
  TrackShadowingUsageDTO,
  GetUsageStatsDTO
} from './shadowing-billing.dto';
import { validateRequest } from '@shared/utils/validation';
import { SuccessResponse } from '@shared/responses';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';

@Service()
export class ShadowingBillingController {
  constructor(private shadowingBillingService: ShadowingBillingService) {}

  /**
   * Get shadowing features for current plan
   * GET /api/billing/shadowing/features
   */
  async getShadowingFeatures(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    const features = await this.shadowingBillingService.getShadowingFeatures(userId);

    return reply.send(
      new SuccessResponse('Shadowing features retrieved', features)
    );
  }

  /**
   * Check if user can use a specific feature
   * GET /api/billing/shadowing/check-feature
   */
  async checkFeatureAvailability(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = await validateRequest(CheckShadowingFeatureDTO, request.query);

    const availability = await this.shadowingBillingService.canUseFeature(
      userId,
      query.feature as any
    );

    return reply.send(
      new SuccessResponse('Feature availability checked', availability)
    );
  }

  /**
   * Track usage (internal use)
   * POST /api/billing/shadowing/track-usage
   */
  async trackUsage(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const data = await validateRequest(TrackShadowingUsageDTO, request.body);

    await this.shadowingBillingService.trackUsage(userId, data.type, data.amount);

    return reply.send(
      new SuccessResponse('Usage tracked successfully')
    );
  }

  /**
   * Get usage statistics
   * GET /api/billing/shadowing/usage-stats
   */
  async getUsageStats(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = await validateRequest(GetUsageStatsDTO, request.query);

    const stats = await this.shadowingBillingService.getUsageStats(
      userId,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined
    );

    return reply.send(
      new SuccessResponse('Usage statistics retrieved', stats)
    );
  }

  /**
   * Get usage summary for current billing period
   * GET /api/billing/shadowing/usage-summary
   */
  async getUsageSummary(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    const [features, stats] = await Promise.all([
      this.shadowingBillingService.getShadowingFeatures(userId),
      this.shadowingBillingService.getUsageStats(userId)
    ]);

    const summary = {
      period: stats.period,
      plan: {
        id: 'current', // This would come from subscription
        name: 'Current Plan'
      },
      usage: {
        minutes: {
          used: stats.totals.minutesPracticed,
          limit: features.dailyMinutes,
          percentUsed: features.dailyMinutes !== 'unlimited'
            ? Math.round((stats.totals.minutesPracticed / (features.dailyMinutes * 30)) * 100)
            : 0
        },
        recordings: {
          created: stats.totals.recordingsCreated,
          stored: 0, // Would need to query current stored count
          limit: features.maxRecordingsStored
        },
        speechToText: {
          used: stats.totals.speechToTextCalls,
          limit: features.speechToTextQuota,
          percentUsed: features.speechToTextQuota !== 'unlimited'
            ? Math.round((stats.totals.speechToTextCalls / features.speechToTextQuota) * 100)
            : 0
        }
      },
      costs: stats.costEstimate ? {
        included: 0,
        overage: stats.costEstimate,
        total: stats.costEstimate,
        currency: 'usd'
      } : undefined
    };

    return reply.send(
      new SuccessResponse('Usage summary retrieved', summary)
    );
  }

  /**
   * Health check
   * GET /api/billing/shadowing/health
   */
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      success: true,
      message: 'Shadowing Billing service is healthy',
      data: {
        service: 'shadowing-billing',
        status: 'operational',
        features: {
          usageTracking: true,
          limitEnforcement: true,
          meteringSupport: true,
          planIntegration: true
        },
        timestamp: new Date()
      }
    });
  }
}
