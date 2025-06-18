import { Container } from 'typedi';
import { YouTubeIntegrationService } from './youtube-integration.service';
import { YouTubeIntegrationController } from './youtube-integration.controller';
import { logger } from '@shared/logger';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';

// Export all components
export { YouTubeIntegrationService } from './youtube-integration.service';
export { YouTubeIntegrationController } from './youtube-integration.controller';
export * from './youtube-integration.dto';
export { checkYouTubeQuota } from './youtube-integration.middleware';

// Export routes
export { default as youtubeIntegrationRoutes } from './youtube-integration.route';

/**
 * Initialize YouTube Integration module
 */
export async function initializeYouTubeIntegrationModule(): Promise<void> {
  try {
    logger.info('Initializing YouTube Integration module...');

    // Check required environment variables
    const requiredEnvVars = ['YOUTUBE_API_KEY', 'YOUTUBE_QUOTA_LIMIT'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Initialize services
    const prisma = Container.get(PrismaService);
    const redis = Container.get(RedisService);

    // Initialize YouTube Integration service
    const youtubeService = Container.get(YouTubeIntegrationService);
    Container.get(YouTubeIntegrationController);

    // Check YouTube API connectivity
    try {
      // Test with a known video ID
      await youtubeService.getVideoInfo({
        videoId: 'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
        includeCaptions: false,
        includeMetadata: false
      });
      logger.info('YouTube API connection verified');
    } catch (error) {
      logger.warn('YouTube API connection test failed', error as Error);
    }

    // Clear expired cache entries
    await cleanupExpiredCache(redis);

    logger.info('✅ YouTube Integration module initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize YouTube Integration module', error as Error);
    throw error;
  }
}

/**
 * Shutdown YouTube Integration module
 */
export async function shutdownYouTubeIntegrationModule(): Promise<void> {
  try {
    logger.info('Shutting down YouTube Integration module...');

    // Cleanup any pending operations
    // Clear module-specific cache keys
    const redis = Container.get(RedisService);
    const keys = await redis.keys('youtube:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info('✅ YouTube Integration module shut down successfully');
  } catch (error) {
    logger.error('Error during YouTube Integration module shutdown', error as Error);
  }
}

/**
 * Clean up expired cache entries
 */
async function cleanupExpiredCache(redis: RedisService): Promise<void> {
  try {
    const patterns = [
      'youtube:search:*',
      'youtube:video:*',
      'youtube:captions:*'
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      logger.debug(`Found ${keys.length} cache keys for pattern: ${pattern}`);
    }
  } catch (error) {
    logger.error('Failed to cleanup cache', error as Error);
  }
}