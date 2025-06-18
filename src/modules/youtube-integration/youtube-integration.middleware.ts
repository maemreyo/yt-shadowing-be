import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenException } from '@shared/exceptions';
import { Container } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';

/**
 * Middleware to check YouTube API quota before making requests
 */
export async function checkYouTubeQuota(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const prisma = Container.get(PrismaService);

  // Check daily quota usage
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyUsage = await prisma.youTubeApiUsage.aggregate({
    where: {
      createdAt: { gte: today }
    },
    _sum: {
      quotaCost: true
    }
  });

  const totalUsage = dailyUsage._sum.quotaCost || 0;
  const quotaLimit = parseInt(process.env.YOUTUBE_QUOTA_LIMIT || '10000');

  if (totalUsage >= quotaLimit) {
    throw new ForbiddenException('YouTube API quota exceeded for today. Please try again tomorrow.');
  }

  // Add remaining quota to response headers
  reply.header('X-YouTube-Quota-Used', totalUsage.toString());
  reply.header('X-YouTube-Quota-Limit', quotaLimit.toString());
  reply.header('X-YouTube-Quota-Remaining', (quotaLimit - totalUsage).toString());
}