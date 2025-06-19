import { Container } from 'typedi';
import { AudioProcessingService } from './audio-processing.service';
import { AudioProcessingController } from './audio-processing.controller';
import { AudioProcessingEventHandlers } from './audio-processing.events';
import { audioQueueProcessor } from './audio-processing.queue';
import { logger } from '@shared/logger';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { QueueService } from '@shared/services/queue.service';

// Export all components
export { AudioProcessingService } from './audio-processing.service';
export { AudioProcessingController } from './audio-processing.controller';
export { AudioProcessingEvents } from './audio-processing.events';
export * from './audio-processing.dto';
export * from './audio-processing.middleware';

// Export routes
export { default as audioProcessingRoutes } from './audio-processing.route';

/**
 * Initialize Audio Processing module
 */
export async function initializeAudioProcessingModule(): Promise<void> {
  try {
    logger.info('Initializing Audio Processing module...');

    // Check required services
    const requiredServices = [
      { name: 'PrismaService', service: PrismaService },
      { name: 'RedisService', service: RedisService },
      { name: 'QueueService', service: QueueService }
    ];

    for (const { name, service } of requiredServices) {
      try {
        Container.get(service);
      } catch (error) {
        throw new Error(`Required service ${name} not initialized`);
      }
    }

    // Check environment variables
    const requiredEnvVars = [
      'CLOUDFLARE_R2_ACCOUNT_ID',
      'CLOUDFLARE_R2_ACCESS_KEY',
      'CLOUDFLARE_R2_SECRET_KEY',
      'CLOUDFLARE_R2_BUCKET',
      'CLOUDFLARE_R2_PUBLIC_URL'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Check optional services
    const optionalServices = [
      { name: 'OpenAI Whisper', envVar: 'OPENAI_WHISPER_API_KEY' },
      { name: 'Google Speech', envVar: 'GOOGLE_SPEECH_API_KEY' },
      { name: 'AssemblyAI', envVar: 'ASSEMBLYAI_API_KEY' }
    ];

    const availableServices: string[] = [];
    optionalServices.forEach(({ name, envVar }) => {
      if (process.env[envVar]) {
        availableServices.push(name);
      }
    });

    if (availableServices.length === 0) {
      logger.warn('No speech-to-text services configured. Audio transcription will not be available.');
    } else {
      logger.info(`Available speech-to-text services: ${availableServices.join(', ')}`);
    }

    // Initialize services
    const audioService = Container.get(AudioProcessingService);
    Container.get(AudioProcessingController);
    Container.get(AudioProcessingEventHandlers);

    // Initialize queue processor
    await audioQueueProcessor.initialize();

    // Create temp directory
    await createTempDirectory();

    // Check ffmpeg installation
    await verifyFfmpegInstallation();

    logger.info('✅ Audio Processing module initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Audio Processing module', error as Error);
    throw error;
  }
}

/**
 * Shutdown Audio Processing module
 */
export async function shutdownAudioProcessingModule(): Promise<void> {
  try {
    logger.info('Shutting down Audio Processing module...');

    // Shutdown queue processor
    await audioQueueProcessor.shutdown();

    // Clear module-specific cache
    const redis = Container.get(RedisService);
    const keys = await redis.keys('audio:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Cleanup temp files
    await cleanupTempFiles();

    logger.info('✅ Audio Processing module shut down successfully');
  } catch (error) {
    logger.error('Error during Audio Processing module shutdown', error as Error);
  }
}

/**
 * Create temp directory for audio processing
 */
async function createTempDirectory(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const tempDir = path.join(os.tmpdir(), 'audio-processing');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    logger.debug(`Created temp directory: ${tempDir}`);
  } catch (error) {
    logger.error('Failed to create temp directory', error as Error);
  }
}

/**
 * Verify ffmpeg installation
 */
async function verifyFfmpegInstallation(): Promise<void> {
  const ffmpeg = await import('fluent-ffmpeg');
  const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');

  ffmpeg.setFfmpegPath(ffmpegInstaller.path);

  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        logger.error('FFmpeg verification failed', err);
        reject(new Error('FFmpeg is not properly installed'));
      } else {
        logger.info('✅ FFmpeg verified and ready');
        resolve();
      }
    });
  });
}

/**
 * Cleanup temporary files
 */
async function cleanupTempFiles(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const tempDir = path.join(os.tmpdir(), 'audio-processing');

  try {
    const files = await fs.readdir(tempDir);

    for (const file of files) {
      if (file.endsWith('.tmp')) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {});
      }
    }

    logger.debug('Cleaned up temporary audio files');
  } catch (error) {
    logger.warn('Failed to cleanup temp files', error as Error);
  }
}

/**
 * Module health check
 */
export async function checkAudioProcessingHealth(): Promise<{
  healthy: boolean;
  details: Record<string, any>;
}> {
  try {
    const prisma = Container.get(PrismaService);
    const redis = Container.get(RedisService);

    // Check database connectivity
    const recordingCount = await prisma.recording.count();

    // Check Redis connectivity
    const cacheKeys = await redis.keys('audio:*');

    // Check queue status
    const queueStats = await audioQueueProcessor.getQueueStats();

    // Check storage
    const storageHealthy = await checkStorageHealth();

    // Check ffmpeg
    let ffmpegHealthy = false;
    try {
      await verifyFfmpegInstallation();
      ffmpegHealthy = true;
    } catch {
      ffmpegHealthy = false;
    }

    return {
      healthy: storageHealthy && ffmpegHealthy,
      details: {
        recordings: recordingCount,
        cachedItems: cacheKeys.length,
        queue: queueStats,
        storage: storageHealthy ? 'connected' : 'disconnected',
        ffmpeg: ffmpegHealthy ? 'available' : 'unavailable',
        speechServices: {
          whisper: !!process.env.OPENAI_WHISPER_API_KEY,
          google: !!process.env.GOOGLE_SPEECH_API_KEY,
          assemblyai: !!process.env.ASSEMBLYAI_API_KEY
        }
      }
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        error: (error as Error).message
      }
    };
  }
}

/**
 * Check storage health
 */
async function checkStorageHealth(): Promise<boolean> {
  try {
    // Simple check - could be enhanced to actually test S3 connectivity
    return !!(
      process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_SECRET_KEY &&
      process.env.CLOUDFLARE_R2_BUCKET
    );
  } catch {
    return false;
  }
}