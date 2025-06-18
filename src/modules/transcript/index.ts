import { Container } from 'typedi';
import { TranscriptService } from './transcript.service';
import { TranscriptController } from './transcript.controller';
import { logger } from '@shared/logger';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { YouTubeIntegrationService } from '@modules/youtube-integration';

// Export all components
export { TranscriptService } from './transcript.service';
export { TranscriptController } from './transcript.controller';
export { TranscriptEvents } from './transcript.events';
export * from './transcript.dto';

// Export routes
export { default as transcriptRoutes } from './transcript.route';

/**
 * Initialize Transcript module
 */
export async function initializeTranscriptModule(): Promise<void> {
  try {
    logger.info('Initializing Transcript module...');

    // Check required services
    const requiredServices = [
      { name: 'PrismaService', service: PrismaService },
      { name: 'RedisService', service: RedisService },
      { name: 'YouTubeIntegrationService', service: YouTubeIntegrationService }
    ];

    for (const { name, service } of requiredServices) {
      try {
        Container.get(service);
      } catch (error) {
        throw new Error(`Required service ${name} not initialized`);
      }
    }

    // Check environment variables
    const optionalEnvVars = [
      'OPENAI_WHISPER_API_KEY',
      'GOOGLE_SPEECH_API_KEY',
      'ASSEMBLYAI_API_KEY'
    ];

    const availableServices: string[] = [];
    optionalEnvVars.forEach(varName => {
      if (process.env[varName]) {
        availableServices.push(varName.replace('_API_KEY', '').toLowerCase());
      }
    });

    if (availableServices.length === 0) {
      logger.warn('No speech-to-text services configured. Only YouTube captions will be available.');
    } else {
      logger.info(`Speech-to-text services available: ${availableServices.join(', ')}`);
    }

    // Initialize services
    const transcriptService = Container.get(TranscriptService);
    Container.get(TranscriptController);

    // Warm up cache with popular videos (optional)
    await warmupCache(transcriptService);

    logger.info('✅ Transcript module initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Transcript module', error as Error);
    throw error;
  }
}

/**
 * Shutdown Transcript module
 */
export async function shutdownTranscriptModule(): Promise<void> {
  try {
    logger.info('Shutting down Transcript module...');

    // Clear module-specific cache
    const redis = Container.get(RedisService);
    const patterns = [
      'transcript:*',
      'transcript:search:*'
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug(`Cleared ${keys.length} cache keys for pattern: ${pattern}`);
      }
    }

    logger.info('✅ Transcript module shut down successfully');
  } catch (error) {
    logger.error('Error during Transcript module shutdown', error as Error);
  }
}

/**
 * Warm up cache with popular videos
 */
async function warmupCache(service: TranscriptService): Promise<void> {
  try {
    // This is optional - you can preload transcripts for popular videos
    const popularVideos = [
      // Add popular video IDs here if needed
    ];

    for (const videoId of popularVideos) {
      try {
        await service.getTranscript({
          videoId,
          language: 'en',
          forceRefresh: false,
          includeTimestamps: true,
          includeWordLevel: false
        });
      } catch (error) {
        logger.debug(`Failed to warmup cache for video ${videoId}`, error as Error);
      }
    }
  } catch (error) {
    logger.debug('Cache warmup failed', error as Error);
  }
}

// ============================================