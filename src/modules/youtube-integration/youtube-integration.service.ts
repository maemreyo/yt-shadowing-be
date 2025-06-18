import { Service } from 'typedi';
import { google, youtube_v3 } from 'googleapis';
import { getSubtitles } from 'youtube-captions-scraper';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { logger } from '@shared/logger';
import {
  VideoSearchDTO,
  VideoInfoDTO,
  CaptionRequestDTO,
  VideoMetadataDTO,
  CaptionDataDTO,
  VideoSearchResultDTO,
  VideoValidationResultDTO,
  CaptionSegment
} from './youtube-integration.dto';
import { BadRequestException, NotFoundException } from '@shared/exceptions';
import { config } from '@config';

@Service()
export class YouTubeIntegrationService {
  private youtube: youtube_v3.Youtube;
  private readonly QUOTA_COSTS = {
    search: 100,
    videos: 1,
    captions: 50,
    channels: 1
  };

  constructor(
    private prisma: PrismaService,
    private redis: RedisService
  ) {
    this.youtube = google.youtube({
      version: 'v3',
      auth: config.youtubeApiKey
    });
  }

  /**
   * Search for videos suitable for language learning
   */
  async searchLearningVideos(dto: VideoSearchDTO): Promise<VideoSearchResultDTO> {
    const cacheKey = `youtube:search:${JSON.stringify(dto)}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Track API usage
      await this.trackApiUsage('search', this.QUOTA_COSTS.search);

      // Build search parameters
      const searchParams: youtube_v3.Params$Resource$Search$List = {
        part: ['snippet'],
        q: dto.query,
        type: ['video'],
        maxResults: dto.maxResults,
        order: dto.orderBy,
        relevanceLanguage: dto.language,
        pageToken: dto.pageToken,
        videoCaption: dto.captionsRequired ? 'closedCaption' : 'any',
        safeSearch: 'moderate'
      };

      // Add duration filter
      if (dto.duration) {
        searchParams.videoDuration = this.mapDurationFilter(dto.duration);
      }

      // Add channel filter
      if (dto.channelId) {
        searchParams.channelId = dto.channelId;
      }

      // Execute search
      const response = await this.youtube.search.list(searchParams);

      if (!response.data.items) {
        throw new NotFoundException('No videos found');
      }

      // Get video IDs for detailed info
      const videoIds = response.data.items
        .map(item => item.id?.videoId)
        .filter(Boolean) as string[];

      // Fetch detailed video info
      const videos = await this.getVideosDetails(videoIds);

      // Calculate suitability scores
      const scoredVideos = await Promise.all(
        videos.map(video => this.calculateSuitabilityScore(video))
      );

      const result: VideoSearchResultDTO = {
        videos: scoredVideos,
        nextPageToken: response.data.nextPageToken || undefined,
        prevPageToken: response.data.prevPageToken || undefined,
        totalResults: response.data.pageInfo?.totalResults || 0,
        resultsPerPage: response.data.pageInfo?.resultsPerPage || dto.maxResults
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

      return result;
    } catch (error) {
      logger.error('YouTube search failed', error as Error);
      throw new BadRequestException('Failed to search YouTube videos');
    }
  }

  /**
   * Get detailed information about a video
   */
  async getVideoInfo(dto: VideoInfoDTO): Promise<VideoMetadataDTO> {
    const cacheKey = `youtube:video:${dto.videoId}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached && !dto.includeMetadata) {
      return JSON.parse(cached);
    }

    // Check if video exists in database
    const existingVideo = await this.prisma.video.findUnique({
      where: { youtubeVideoId: dto.videoId }
    });

    if (existingVideo && !dto.includeMetadata) {
      return this.mapVideoToMetadata(existingVideo);
    }

    try {
      // Track API usage
      await this.trackApiUsage('videos', this.QUOTA_COSTS.videos);

      // Fetch video details
      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [dto.videoId]
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new NotFoundException('Video not found');
      }

      const video = response.data.items[0];
      const metadata = await this.parseVideoData(video, dto.includeCaptions);

      // Save to database
      await this.saveVideoToDatabase(metadata);

      // Cache for 24 hours
      await this.redis.setex(cacheKey, 86400, JSON.stringify(metadata));

      return metadata;
    } catch (error) {
      logger.error('Failed to get video info', error as Error);
      throw new BadRequestException('Failed to get video information');
    }
  }

  /**
   * Get video captions/subtitles
   */
  async getCaptions(dto: CaptionRequestDTO): Promise<CaptionDataDTO> {
    const cacheKey = `youtube:captions:${dto.videoId}:${dto.language}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check database
    const existingTranscript = await this.prisma.transcript.findFirst({
      where: {
        video: { youtubeVideoId: dto.videoId },
        language: dto.language
      }
    });

    if (existingTranscript) {
      return this.mapTranscriptToCaptionData(existingTranscript);
    }

    try {
      // Try to get captions using youtube-captions-scraper
      const captions = await getSubtitles({
        videoID: dto.videoId,
        lang: dto.language
      });

      if (!captions || captions.length === 0) {
        throw new NotFoundException('No captions found for this video');
      }

      // Parse captions into our format
      const segments: CaptionSegment[] = captions.map((caption, index) => ({
        index,
        text: caption.text,
        startTime: caption.start / 1000, // Convert to seconds
        endTime: (caption.start + caption.dur) / 1000,
        duration: caption.dur / 1000
      }));

      const fullText = segments.map(s => s.text).join(' ');
      const wordCount = fullText.split(/\s+/).length;

      const captionData: CaptionDataDTO = {
        videoId: dto.videoId,
        language: dto.language,
        isAutoGenerated: false, // We'll need to detect this
        segments,
        fullText,
        wordCount,
        estimatedDifficulty: this.estimateDifficulty(fullText, wordCount)
      };

      // Save to database
      await this.saveCaptionsToDatabase(dto.videoId, captionData);

      // Format based on requested format
      if (dto.format !== 'json') {
        return this.formatCaptions(captionData, dto.format);
      }

      // Cache for 7 days
      await this.redis.setex(cacheKey, 604800, JSON.stringify(captionData));

      return captionData;
    } catch (error) {
      logger.error('Failed to get captions', error as Error);

      // If youtube-captions-scraper fails, try YouTube API
      return this.getCaptionsFromApi(dto);
    }
  }

  /**
   * Validate if a video is suitable for language learning
   */
  async validateVideoForLearning(videoId: string): Promise<VideoValidationResultDTO> {
    try {
      const video = await this.getVideoInfo({
        videoId,
        includeCaptions: true,
        includeMetadata: true
      });

      const issues: string[] = [];
      const recommendations = {
        difficulty: video.difficultyLevel,
        suitability: video.suitabilityScore,
        reasons: [] as string[]
      };

      // Check duration
      if (video.duration < 60) {
        issues.push('Video is too short (less than 1 minute)');
        recommendations.reasons.push('Short videos may not provide enough context');
      } else if (video.duration > 1200) {
        issues.push('Video is too long (more than 20 minutes)');
        recommendations.reasons.push('Long videos can be overwhelming for practice');
      }

      // Check captions availability
      if (!video.availableCaptions || video.availableCaptions.length === 0) {
        issues.push('No captions available');
        recommendations.reasons.push('Captions are essential for language learning');
      }

      // Check content suitability
      if (video.suitabilityScore < 50) {
        issues.push('Content may not be suitable for language learning');
        recommendations.reasons.push('Consider educational or conversational content');
      }

      // Additional checks based on metadata
      if (video.learningMetadata) {
        if (video.learningMetadata.speechRate && video.learningMetadata.speechRate > 180) {
          issues.push('Speech rate is too fast');
          recommendations.reasons.push('Fast speech can be difficult for learners');
        }
      }

      return {
        isValid: issues.length === 0,
        videoId,
        issues,
        metadata: video,
        recommendations: issues.length > 0 ? recommendations : undefined
      };
    } catch (error) {
      logger.error('Video validation failed', error as Error);
      return {
        isValid: false,
        videoId,
        issues: ['Failed to validate video'],
        recommendations: undefined
      };
    }
  }

  /**
   * Private helper methods
   */
  private mapDurationFilter(duration: 'short' | 'medium' | 'long'): string {
    switch (duration) {
      case 'short':
        return 'short'; // < 4 minutes
      case 'medium':
        return 'medium'; // 4-20 minutes
      case 'long':
        return 'long'; // > 20 minutes
      default:
        return 'any';
    }
  }

  private async getVideosDetails(videoIds: string[]): Promise<VideoMetadataDTO[]> {
    if (videoIds.length === 0) return [];

    // Track API usage
    await this.trackApiUsage('videos', this.QUOTA_COSTS.videos);

    const response = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds
    });

    if (!response.data.items) return [];

    return Promise.all(
      response.data.items.map(video => this.parseVideoData(video, false))
    );
  }

  private async parseVideoData(
    video: youtube_v3.Schema$Video,
    includeCaptions: boolean = true
  ): Promise<VideoMetadataDTO> {
    const duration = this.parseDuration(video.contentDetails?.duration || 'PT0S');

    const metadata: VideoMetadataDTO = {
      videoId: video.id!,
      title: video.snippet?.title || '',
      description: video.snippet?.description || '',
      duration,
      channelId: video.snippet?.channelId || '',
      channelName: video.snippet?.channelTitle || '',
      thumbnailUrl: video.snippet?.thumbnails?.high?.url ||
                    video.snippet?.thumbnails?.default?.url || '',
      publishedAt: new Date(video.snippet?.publishedAt || Date.now()),
      viewCount: parseInt(video.statistics?.viewCount || '0'),
      likeCount: video.statistics?.likeCount ? parseInt(video.statistics.likeCount) : undefined,
      tags: video.snippet?.tags || [],
      availableCaptions: [],
      suitabilityScore: 0,
      difficultyLevel: 1
    };

    // Get available captions if requested
    if (includeCaptions) {
      metadata.availableCaptions = await this.getAvailableCaptions(video.id!);
    }

    return metadata;
  }

  private parseDuration(isoDuration: string): number {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  private async getAvailableCaptions(videoId: string): Promise<any[]> {
    try {
      // This would require additional API calls or scraping
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Failed to get available captions', error as Error);
      return [];
    }
  }

  private async calculateSuitabilityScore(video: VideoMetadataDTO): Promise<VideoMetadataDTO> {
    let score = 50; // Base score

    // Duration scoring
    if (video.duration >= 120 && video.duration <= 600) {
      score += 20; // Optimal duration 2-10 minutes
    } else if (video.duration >= 60 && video.duration <= 1200) {
      score += 10; // Acceptable duration
    }

    // Has captions
    if (video.availableCaptions.length > 0) {
      score += 20;
    }

    // Educational content indicators
    const educationalKeywords = ['learn', 'lesson', 'tutorial', 'explain', 'how to', 'education'];
    const hasEducationalContent = educationalKeywords.some(keyword =>
      video.title.toLowerCase().includes(keyword) ||
      video.description.toLowerCase().includes(keyword)
    );

    if (hasEducationalContent) {
      score += 10;
    }

    // Estimate difficulty based on title/description complexity
    const difficulty = this.estimateDifficulty(
      video.title + ' ' + video.description,
      (video.title + ' ' + video.description).split(/\s+/).length
    );

    return {
      ...video,
      suitabilityScore: Math.min(100, score),
      difficultyLevel: difficulty
    };
  }

  private estimateDifficulty(text: string, wordCount: number): number {
    // Simple difficulty estimation based on text complexity
    const avgWordLength = text.length / wordCount;
    const complexWords = text.match(/\b\w{10,}\b/g)?.length || 0;
    const complexityRatio = complexWords / wordCount;

    if (avgWordLength < 4 && complexityRatio < 0.05) return 1; // Very easy
    if (avgWordLength < 5 && complexityRatio < 0.1) return 2; // Easy
    if (avgWordLength < 6 && complexityRatio < 0.15) return 3; // Medium
    if (avgWordLength < 7 && complexityRatio < 0.2) return 4; // Hard
    return 5; // Very hard
  }

  private async trackApiUsage(endpoint: string, quotaCost: number): Promise<void> {
    try {
      await this.prisma.youTubeApiUsage.create({
        data: {
          endpoint,
          quotaCost,
          responseCode: 200,
          requestData: {}
        }
      });

      // Check daily quota
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailyUsage = await this.prisma.youTubeApiUsage.aggregate({
        where: {
          createdAt: { gte: today }
        },
        _sum: {
          quotaCost: true
        }
      });

      const totalUsage = dailyUsage._sum.quotaCost || 0;
      if (totalUsage >= config.youtubeQuotaLimit) {
        throw new BadRequestException('YouTube API quota exceeded for today');
      }
    } catch (error) {
      logger.error('Failed to track API usage', error as Error);
    }
  }

  private async saveVideoToDatabase(metadata: VideoMetadataDTO): Promise<void> {
    try {
      await this.prisma.video.upsert({
        where: { youtubeVideoId: metadata.videoId },
        update: {
          title: metadata.title,
          duration: metadata.duration,
          thumbnailUrl: metadata.thumbnailUrl,
          metadata: metadata as any
        },
        create: {
          youtubeVideoId: metadata.videoId,
          title: metadata.title,
          duration: metadata.duration,
          language: 'en', // Default, should be detected
          difficultyLevel: metadata.difficultyLevel,
          transcriptAvailable: metadata.availableCaptions.length > 0,
          channelId: metadata.channelId,
          channelName: metadata.channelName,
          thumbnailUrl: metadata.thumbnailUrl,
          tags: metadata.tags,
          metadata: metadata as any
        }
      });
    } catch (error) {
      logger.error('Failed to save video to database', error as Error);
    }
  }

  private async saveCaptionsToDatabase(videoId: string, captions: CaptionDataDTO): Promise<void> {
    try {
      // First ensure video exists
      const video = await this.prisma.video.findUnique({
        where: { youtubeVideoId: videoId }
      });

      if (!video) {
        // Create basic video entry
        await this.prisma.video.create({
          data: {
            youtubeVideoId: videoId,
            title: 'Unknown',
            duration: 0,
            language: captions.language,
            difficultyLevel: captions.estimatedDifficulty,
            transcriptAvailable: true
          }
        });
      }

      // Save transcript
      await this.prisma.transcript.upsert({
        where: {
          videoId_language: {
            videoId: video?.id || videoId,
            language: captions.language
          }
        },
        update: {
          sentences: captions.segments as any,
          fullText: captions.fullText,
          confidence: 1.0
        },
        create: {
          videoId: video?.id || videoId,
          language: captions.language,
          sentences: captions.segments as any,
          fullText: captions.fullText,
          source: 'youtube',
          confidence: 1.0
        }
      });
    } catch (error) {
      logger.error('Failed to save captions to database', error as Error);
    }
  }

  private mapVideoToMetadata(video: any): VideoMetadataDTO {
    return {
      videoId: video.youtubeVideoId,
      title: video.title,
      description: video.metadata?.description || '',
      duration: video.duration,
      channelId: video.channelId || '',
      channelName: video.channelName || '',
      thumbnailUrl: video.thumbnailUrl || '',
      publishedAt: video.createdAt,
      viewCount: video.metadata?.viewCount || 0,
      tags: video.tags || [],
      availableCaptions: [],
      suitabilityScore: video.metadata?.suitabilityScore || 50,
      difficultyLevel: video.difficultyLevel
    };
  }

  private mapTranscriptToCaptionData(transcript: any): CaptionDataDTO {
    return {
      videoId: transcript.video.youtubeVideoId,
      language: transcript.language,
      isAutoGenerated: false,
      segments: transcript.sentences as CaptionSegment[],
      fullText: transcript.fullText,
      wordCount: transcript.fullText.split(/\s+/).length,
      estimatedDifficulty: transcript.video.difficultyLevel
    };
  }

  private formatCaptions(captions: CaptionDataDTO, format: 'srt' | 'vtt' | 'json'): any {
    // Implementation for different caption formats
    if (format === 'json') return captions;

    // TODO: Implement SRT and VTT formatting
    return captions;
  }

  private async getCaptionsFromApi(dto: CaptionRequestDTO): Promise<CaptionDataDTO> {
    // Fallback to YouTube API for captions
    // This requires additional implementation
    throw new NotFoundException('Captions not available through API');
  }
}