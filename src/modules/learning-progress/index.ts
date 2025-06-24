// CREATED: 2025-06-20 - Module exports for Learning Progress

import { Container } from 'typedi';
import { LearningProgressService } from './learning-progress.service';
import { LearningProgressController } from './learning-progress.controller';
import { LearningProgressEventHandler, LearningProgressEvents } from './learning-progress.events';
import { logger } from '@shared/logger';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { AnalyticsService } from '@modules/analytics';
import { UserService } from '@modules/user';

// Export all components
export { LearningProgressService } from './learning-progress.service';
export { LearningProgressController } from './learning-progress.controller';
export { LearningProgressEvents, LearningProgressEventHandler } from './learning-progress.events';
export * from './learning-progress.dto';

// Export routes
export { default as learningProgressRoutes } from './learning-progress.route';

/**
 * Initialize Learning Progress module
 */
export async function initializeLearningProgressModule(): Promise<void> {
  try {
    logger.info('Initializing Learning Progress module...');

    // Check required services
    const requiredServices = [
      { name: 'PrismaService', service: PrismaService },
      { name: 'RedisService', service: RedisService },
      { name: 'AnalyticsService', service: AnalyticsService },
      { name: 'UserService', service: UserService }
    ];

    for (const { name, service } of requiredServices) {
      try {
        Container.get(service);
      } catch (error) {
        throw new Error(`Required service ${name} not initialized`);
      }
    }

    // Register event handler
    Container.get(LearningProgressEventHandler);

    // Verify database models
    const prisma = Container.get(PrismaService);
    await prisma.learningProgress.count(); // This will throw if model doesn't exist

    logger.info('Learning Progress module initialized successfully', {
      features: {
        tracking: true,
        analytics: true,
        reports: true,
        recommendations: true,
        streaks: true,
        milestones: true
      }
    });
  } catch (error) {
    logger.error('Failed to initialize Learning Progress module', error as Error);
    throw error;
  }
}

/**
 * Health check for the module
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  details: Record<string, any>;
}> {
  try {
    const service = Container.get(LearningProgressService);
    const prisma = Container.get(PrismaService);
    const redis = Container.get(RedisService);

    // Check database connection
    const dbCheck = await prisma.learningProgress
      .count()
      .then(() => true)
      .catch(() => false);

    // Check Redis connection
    const redisCheck = await redis
      .ping()
      .then(() => true)
      .catch(() => false);

    return {
      healthy: dbCheck && redisCheck,
      details: {
        database: dbCheck ? 'connected' : 'disconnected',
        redis: redisCheck ? 'connected' : 'disconnected',
        service: 'operational',
        features: {
          tracking: true,
          analytics: true,
          reports: true,
          recommendations: true,
          streaks: true,
          milestones: true
        }
      }
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}
