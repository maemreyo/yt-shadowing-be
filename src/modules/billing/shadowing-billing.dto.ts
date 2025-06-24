// DTOs for YouTube Shadowing billing features

import { z } from 'zod';

/**
 * Check feature availability
 */
export class CheckShadowingFeatureDTO {
  static schema = z.object({
    feature: z.enum(['practice', 'recording', 'speech_to_text', 'export', 'analytics'])
  });
}

/**
 * Track usage
 */
export class TrackShadowingUsageDTO {
  static schema = z.object({
    type: z.enum(['minutes', 'recordings', 'speech_to_text']),
    amount: z.number().min(0).default(1),
    metadata: z.object({
      sessionId: z.string().optional(),
      videoId: z.string().optional(),
      recordingId: z.string().optional()
    }).optional()
  });
}

/**
 * Get usage statistics
 */
export class GetUsageStatsDTO {
  static schema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional()
  });
}

/**
 * Upgrade prompt response
 */
export class UpgradePromptDTO {
  feature: string;
  currentPlan: string;
  suggestedPlan: string;
  reason: string;
  benefits: string[];
  currentLimit: number | string;
  used: number;
  upgradeUrl: string;
  ctaText: string;
}

/**
 * Feature availability response
 */
export class FeatureAvailabilityDTO {
  allowed: boolean;
  feature: string;
  reason?: string;
  limit?: number | string;
  used?: number;
  remaining?: number | string;
  resetsAt?: Date;
  upgradeUrl?: string;
}

/**
 * Shadowing plan features response
 */
export class ShadowingPlanFeaturesDTO {
  planId: string;
  planName: string;
  limits: {
    dailyMinutes: number | 'unlimited';
    maxRecordingsStored: number | 'unlimited';
    audioQuality: 'standard' | 'high' | 'studio';
    speechToTextQuota: number | 'unlimited';
    exportFormats: string[];
  };
  features: Array<{
    id: string;
    name: string;
    description: string;
    included: boolean;
  }>;
}

/**
 * Usage summary response
 */
export class UsageSummaryDTO {
  period: {
    start: Date;
    end: Date;
  };
  plan: {
    id: string;
    name: string;
  };
  usage: {
    minutes: {
      used: number;
      limit: number | 'unlimited';
      percentUsed?: number;
    };
    recordings: {
      created: number;
      stored: number;
      limit: number | 'unlimited';
    };
    speechToText: {
      used: number;
      limit: number | 'unlimited';
      percentUsed?: number;
    };
  };
  costs?: {
    included: number;
    overage: number;
    total: number;
    currency: string;
  };
}
