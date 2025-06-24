// CREATED: 2025-06-20 - API endpoints for learning progress tracking

import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { LearningProgressService } from './learning-progress.service';
import {
  TrackProgressDTO,
  UpdateProgressDTO,
  AnalyticsQueryDTO,
  GenerateReportDTO,
  GetRecommendationsDTO,
  StreakQueryDTO
} from './learning-progress.dto';
import { validateRequest } from '@shared/utils/validation';
import { SuccessResponse } from '@shared/responses';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';

@Service()
export class LearningProgressController {
  constructor(private learningProgressService: LearningProgressService) {}

  /**
   * Track progress for a single sentence
   * POST /api/learning-progress/track
   */
  async trackProgress(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const data = await validateRequest(TrackProgressDTO, request.body);

    await this.learningProgressService.trackProgress(userId, data);

    return reply.send(
      new SuccessResponse('Progress tracked successfully')
    );
  }

  /**
   * Update progress for multiple sentences
   * PUT /api/learning-progress/bulk
   */
  async updateBulkProgress(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const data = await validateRequest(UpdateProgressDTO, request.body);

    await this.learningProgressService.updateProgress(userId, data);

    return reply.send(
      new SuccessResponse('Progress updated successfully')
    );
  }

  /**
   * Get learning analytics
   * GET /api/learning-progress/analytics
   */
  async getAnalytics(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = await validateRequest(AnalyticsQueryDTO, request.query);

    const analytics = await this.learningProgressService.getAnalytics(userId, query);

    return reply.send(
      new SuccessResponse('Analytics retrieved successfully', analytics)
    );
  }

  /**
   * Generate progress report
   * GET /api/learning-progress/report
   */
  async generateReport(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = await validateRequest(GenerateReportDTO, request.query);

    const report = await this.learningProgressService.generateReport(userId, query);

    return reply.send(
      new SuccessResponse('Report generated successfully', report)
    );
  }

  /**
   * Get personalized recommendations
   * GET /api/learning-progress/recommendations
   */
  async getRecommendations(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = await validateRequest(GetRecommendationsDTO, request.query);

    const recommendations = await this.learningProgressService.getRecommendations(userId, query);

    return reply.send(
      new SuccessResponse('Recommendations retrieved successfully', {
        recommendations,
        total: recommendations.length
      })
    );
  }

  /**
   * Get streak data
   * GET /api/learning-progress/streaks
   */
  async getStreaks(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = await validateRequest(StreakQueryDTO, request.query);

    const streaks = await this.learningProgressService.calculateStreaks(userId, query);

    return reply.send(
      new SuccessResponse('Streak data retrieved successfully', streaks)
    );
  }

  /**
   * Get user milestones
   * GET /api/learning-progress/milestones
   */
  async getMilestones(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    // Get milestones from streak data
    const streakData = await this.learningProgressService.calculateStreaks(userId, {
      includeHistory: false
    });

    return reply.send(
      new SuccessResponse('Milestones retrieved successfully', {
        milestones: streakData.milestones,
        total: streakData.milestones.length
      })
    );
  }

  /**
   * Get learning summary for a specific video
   * GET /api/learning-progress/video/:videoId/summary
   */
  async getVideoSummary(
    request: FastifyRequest<{ Params: { videoId: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.user!.id;
    const { videoId } = request.params;

    const analytics = await this.learningProgressService.getAnalytics(userId, {
      timeframe: 'all',
      videoId,
      metrics: ['sentencesCompleted', 'averageScore', 'totalMinutes']
    });

    return reply.send(
      new SuccessResponse('Video summary retrieved successfully', analytics)
    );
  }

  /**
   * Health check
   * GET /api/learning-progress/health
   */
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      success: true,
      message: 'Learning Progress module is healthy',
      data: {
        service: 'learning-progress',
        status: 'operational',
        features: {
          tracking: true,
          analytics: true,
          reports: true,
          recommendations: true,
          streaks: true,
          milestones: true
        },
        timestamp: new Date()
      }
    });
  }
}