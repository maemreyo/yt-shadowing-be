import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { YouTubeIntegrationService } from './youtube-integration.service';
import {
  VideoSearchDTO,
  VideoInfoDTO,
  CaptionRequestDTO,
  VideoValidationDTO
} from './youtube-integration.dto';
import { validateRequest } from '@shared/utils/validation';
import { SuccessResponse } from '@shared/responses';
import { rateLimiter } from '@shared/middleware/rate-limiter';

@Service()
export class YouTubeIntegrationController {
  constructor(private youtubeService: YouTubeIntegrationService) {}

  /**
   * Search for YouTube videos suitable for language learning
   * GET /api/youtube/search
   */
  async searchVideos(request: FastifyRequest, reply: FastifyReply) {
    const query = await validateRequest(VideoSearchDTO, request.query);

    const result = await this.youtubeService.searchLearningVideos(query);

    return reply.send(
      new SuccessResponse('Videos found successfully', result)
    );
  }

  /**
   * Get detailed information about a specific video
   * GET /api/youtube/video/:videoId
   */
  async getVideoInfo(request: FastifyRequest<{ Params: { videoId: string } }>, reply: FastifyReply) {
    const { videoId } = request.params;
    const query = await validateRequest(VideoInfoDTO, {
      videoId,
      ...request.query
    });

    const video = await this.youtubeService.getVideoInfo(query);

    return reply.send(
      new SuccessResponse('Video information retrieved', video)
    );
  }

  /**
   * Get captions for a specific video
   * GET /api/youtube/captions/:videoId
   */
  async getCaptions(request: FastifyRequest<{ Params: { videoId: string } }>, reply: FastifyReply) {
    const { videoId } = request.params;
    const query = await validateRequest(CaptionRequestDTO, {
      videoId,
      ...request.query
    });

    const captions = await this.youtubeService.getCaptions(query);

    return reply.send(
      new SuccessResponse('Captions retrieved successfully', captions)
    );
  }

  /**
   * Validate if a video is suitable for language learning
   * POST /api/youtube/validate
   */
  async validateVideo(request: FastifyRequest, reply: FastifyReply) {
    const body = await validateRequest(VideoValidationDTO, request.body);

    const result = await this.youtubeService.validateVideoForLearning(body.videoId);

    return reply.send(
      new SuccessResponse('Video validation completed', result)
    );
  }

  /**
   * Get API usage statistics
   * GET /api/youtube/usage
   */
  async getApiUsage(request: FastifyRequest, reply: FastifyReply) {
    // This would be implemented to return YouTube API usage stats
    return reply.send(
      new SuccessResponse('API usage statistics', {
        quotaUsed: 0,
        quotaLimit: 10000,
        resetTime: new Date()
      })
    );
  }
}

// ============================================