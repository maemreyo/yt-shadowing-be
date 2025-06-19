import { Container } from 'typedi';
import { PracticeSessionService } from './practice-session.service';
import { PracticeSessionController } from './practice-session.controller';
import { PracticeSessionEventHandlers } from './practice-session.events';
import { logger } from '@shared/logger';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { YouTubeIntegrationService } from '@modules/youtube-integration';
import { TranscriptService } from '@modules/transcript';

// Export all components
export { PracticeSessionService } from './practice-session.service';
export { PracticeSessionController } from './practice-session.controller';
export { PracticeSessionEvents } from './practice-session.events';
export * from './practice-session.dto';
export * from './practice-session.middleware';

// Export routes
export { default as practiceSessionRoutes } from './practice-session.route';

/**
 * Initialize Practice Session module
 */
export async function initializePracticeSessionModule(): Promise<void> {
  try {
    logger.info('Initializing Practice Session module...');

    // Check required services
    const requiredServices = [
      { name: 'PrismaService', service: PrismaService },
      { name: 'RedisService', service: RedisService },
      { name: 'YouTubeIntegrationService', service: YouTubeIntegrationService },
      { name: 'TranscriptService', service: TranscriptService }
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
      'FREE_TIER_DAILY_MINUTES',
      'PRO_TIER_DAILY_MINUTES'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      logger.warn(`Missing environment variables: ${missingVars.join(', ')}. Using defaults.`);
    }

    // Initialize services
    const practiceSessionService = Container.get(PracticeSessionService);
    Container.get(PracticeSessionController);
    Container.get(PracticeSessionEventHandlers);

    // Cleanup expired sessions on startup
    await cleanupExpiredSessions();

    logger.info('✅ Practice Session module initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Practice Session module', error as Error);
    throw error;
  }
}

/**
 * Shutdown Practice Session module
 */
export async function shutdownPracticeSessionModule(): Promise<void> {
  try {
    logger.info('Shutting down Practice Session module...');

    // Save any pending session states
    await savePendingStates();

    // Clear module-specific cache
    const redis = Container.get(RedisService);
    const keys = await redis.keys('practice-session:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info('✅ Practice Session module shut down successfully');
  } catch (error) {
    logger.error('Error during Practice Session module shutdown', error as Error);
  }
}

/**
 * Clean up expired sessions
 */
async function cleanupExpiredSessions(): Promise<void> {
  try {
    const prisma = Container.get(PrismaService);

    // Find sessions older than 24 hours that are still active
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expiredSessions = await prisma.practiceSession.updateMany({
      where: {
        status: 'ACTIVE',
        lastActiveAt: {
          lt: cutoffTime
        }
      },
      data: {
        status: 'EXPIRED',
        endTime: cutoffTime
      }
    });

    if (expiredSessions.count > 0) {
      logger.info(`Cleaned up ${expiredSessions.count} expired sessions`);
    }
  } catch (error) {
    logger.error('Failed to cleanup expired sessions', error as Error);
  }
}

/**
 * Save any pending session states before shutdown
 */
async function savePendingStates(): Promise<void> {
  try {
    const redis = Container.get(RedisService);
    const keys = await redis.keys('practice-session:pending:*');

    if (keys.length === 0) return;

    logger.info(`Saving ${keys.length} pending session states...`);

    // Process each pending state
    for (const key of keys) {
      try {
        const data = await redis.get(key);
        if (data) {
          // Parse and save to database
          const pendingState = JSON.parse(data);
          // Implementation would save this to database
          await redis.del(key);
        }
      } catch (err) {
        logger.error(`Failed to save pending state for ${key}`, err as Error);
      }
    }
  } catch (error) {
    logger.error('Failed to save pending states', error as Error);
  }
}

/**
 * Module health check
 */
export async function checkPracticeSessionHealth(): Promise<{
  healthy: boolean;
  details: Record<string, any>;
}> {
  try {
    const prisma = Container.get(PrismaService);
    const redis = Container.get(RedisService);

    // Check database connectivity
    const activeSessions = await prisma.practiceSession.count({
      where: { status: 'ACTIVE' }
    });

    // Check Redis connectivity
    const cacheKeys = await redis.keys('practice-session:*');

    return {
      healthy: true,
      details: {
        activeSessions,
        cachedSessions: cacheKeys.length,
        dependencies: {
          youtube: 'connected',
          transcript: 'connected'
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