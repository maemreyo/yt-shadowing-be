import { FastifyRequest, FastifyReply } from 'fastify';
import { Container } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { AppError } from '@shared/errors';
import { logger } from '@shared/logger';

/**
 * Middleware to check if user has an active session
 */
export async function checkActiveSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user;
    const prisma = Container.get(PrismaService);

    // Check for active sessions
    const activeSession = await prisma.practiceSession.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        endTime: null
      },
      orderBy: {
        startTime: 'desc'
      }
    });

    if (activeSession) {
      // Add session to request
      (request as any).activeSession = activeSession;
    }
  } catch (error) {
    logger.error('Error checking active session', error as Error);
    // Don't block the request on error
  }
}

/**
 * Middleware to validate session ownership
 */
export async function validateSessionOwnership(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user;
    const { sessionId } = request.params;
    const prisma = Container.get(PrismaService);

    const session = await prisma.practiceSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id
      }
    });

    if (!session) {
      throw new AppError(
        'Session not found or access denied',
        404,
        'SESSION_NOT_FOUND'
      );
    }

    // Add session to request for use in handlers
    (request as any).session = session;
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code
      });
    }

    logger.error('Error validating session ownership', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to check daily usage limits
 */
export async function checkDailyLimit(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user;
    const prisma = Container.get(PrismaService);

    // Get user's subscription tier
    const userWithSub = await prisma.user.findUnique({
      where: { id: user.id },
      include: { subscription: true }
    });

    const tier = userWithSub?.subscription?.plan || 'free';
    const limits = {
      free: parseInt(process.env.FREE_TIER_DAILY_MINUTES || '30'),
      pro: parseInt(process.env.PRO_TIER_DAILY_MINUTES || '300'),
      premium: -1 // unlimited
    };

    const limit = limits[tier as keyof typeof limits] || limits.free;

    if (limit === -1) {
      return; // No limit for premium users
    }

    // Calculate today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayUsage = await prisma.practiceSession.aggregate({
      where: {
        userId: user.id,
        startTime: { gte: today }
      },
      _sum: {
        totalTimeSpent: true
      }
    });

    const usedMinutes = Math.floor((todayUsage._sum.totalTimeSpent || 0) / 60);

    if (usedMinutes >= limit) {
      throw new AppError(
        `Daily practice limit of ${limit} minutes exceeded`,
        403,
        'DAILY_LIMIT_EXCEEDED',
        {
          limit,
          used: usedMinutes,
          tier,
          upgradeUrl: '/pricing'
        }
      );
    }

    // Add remaining minutes to request
    (request as any).remainingMinutes = limit - usedMinutes;
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code,
        data: error.data
      });
    }

    logger.error('Error checking daily limit', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to validate video availability
 */
export async function validateVideoAccess(
  request: FastifyRequest<{ Body: { videoId: string } }>,
  reply: FastifyReply
) {
  try {
    const { videoId } = request.body as { videoId: string };
    const prisma = Container.get(PrismaService);

    // Check if video exists in our database
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: videoId }
    });

    if (video && video.status === 'BLOCKED') {
      throw new AppError(
        'This video is not available for practice',
        403,
        'VIDEO_BLOCKED'
      );
    }

    // Add video to request if it exists
    if (video) {
      (request as any).video = video;
    }
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code
      });
    }

    logger.error('Error validating video access', error as Error);
    // Don't block if error - let the service handle video validation
  }
}

/**
 * Middleware to track session activity
 */
export async function trackSessionActivity(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const sessionId = (request.params as any)?.sessionId;
    if (!sessionId) return;

    const prisma = Container.get(PrismaService);

    // Update last active timestamp
    await prisma.practiceSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() }
    });
  } catch (error) {
    // Don't block request on tracking error
    logger.warn('Failed to track session activity', error as Error);
  }
}