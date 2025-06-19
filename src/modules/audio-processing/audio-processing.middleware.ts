import { FastifyRequest, FastifyReply } from 'fastify';
import { Container } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { AppError } from '@shared/errors';
import { logger } from '@shared/logger';

/**
 * Middleware to validate file size before processing
 */
export async function validateFileSize(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const body = request.body as any;
    const user = (request as any).user;

    if (!body.audioData) {
      return; // No audio data to validate
    }

    // Get user's subscription tier
    const prisma = Container.get(PrismaService);
    const userWithSub = await prisma.user.findUnique({
      where: { id: user.id },
      include: { subscription: true }
    });

    const tier = userWithSub?.subscription?.plan || 'free';
    const maxSizeMB = {
      free: 10,
      pro: 50,
      premium: 100
    }[tier] || 10;

    // Calculate file size from base64
    const base64Length = body.audioData.length;
    const padding = (body.audioData.match(/=/g) || []).length;
    const fileSizeBytes = (base64Length * 3) / 4 - padding;
    const fileSizeMB = fileSizeBytes / (1024 * 1024);

    if (fileSizeMB > maxSizeMB) {
      throw new AppError(
        `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size of ${maxSizeMB}MB for ${tier} tier`,
        413,
        'FILE_TOO_LARGE',
        {
          fileSize: fileSizeMB,
          maxSize: maxSizeMB,
          tier
        }
      );
    }

    // Add file size to request for later use
    (request as any).audioFileSize = fileSizeBytes;
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code,
        data: error.data
      });
    }

    logger.error('Error validating file size', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to validate audio format
 */
export async function validateAudioFormat(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const body = request.body as any;

    if (!body.mimeType) {
      return; // No mime type to validate
    }

    const allowedFormats = [
      'audio/webm',
      'audio/wav',
      'audio/mp3',
      'audio/ogg',
      'audio/mpeg'
    ];

    if (!allowedFormats.includes(body.mimeType)) {
      throw new AppError(
        `Unsupported audio format: ${body.mimeType}`,
        415,
        'UNSUPPORTED_FORMAT',
        {
          format: body.mimeType,
          supported: allowedFormats
        }
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code,
        data: error.data
      });
    }

    logger.error('Error validating audio format', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to check recording ownership
 */
export async function validateRecordingOwnership(
  request: FastifyRequest<{ Params: { recordingId: string } }>,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user;
    const { recordingId } = request.params;
    const prisma = Container.get(PrismaService);

    const recording = await prisma.recording.findFirst({
      where: {
        id: recordingId,
        userId: user.id
      }
    });

    if (!recording) {
      throw new AppError(
        'Recording not found or access denied',
        404,
        'RECORDING_NOT_FOUND'
      );
    }

    // Add recording to request for use in handlers
    (request as any).recording = recording;
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code
      });
    }

    logger.error('Error validating recording ownership', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to check storage quota
 */
export async function checkStorageQuota(
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
    const storageQuotaGB = {
      free: 0.5,    // 500 MB
      pro: 5,       // 5 GB
      premium: 50   // 50 GB
    }[tier] || 0.5;

    // Calculate current usage
    const totalStorage = await prisma.recording.aggregate({
      where: { userId: user.id },
      _sum: { fileSize: true }
    });

    const currentUsageGB = (totalStorage._sum.fileSize || 0) / (1024 * 1024 * 1024);
    const audioFileSize = (request as any).audioFileSize || 0;
    const newUsageGB = currentUsageGB + (audioFileSize / (1024 * 1024 * 1024));

    if (newUsageGB > storageQuotaGB) {
      throw new AppError(
        'Storage quota exceeded',
        507,
        'STORAGE_QUOTA_EXCEEDED',
        {
          currentUsageGB: currentUsageGB.toFixed(2),
          quotaGB: storageQuotaGB,
          tier,
          upgradeUrl: '/pricing'
        }
      );
    }

    // Warn if approaching limit (80% usage)
    const usagePercentage = (currentUsageGB / storageQuotaGB) * 100;
    if (usagePercentage > 80) {
      const eventEmitter = Container.get('EventEmitter');
      eventEmitter.emit('audio:storage-limit-warning', {
        userId: user.id,
        percentage: Math.round(usagePercentage),
        currentUsageGB,
        quotaGB: storageQuotaGB
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code,
        data: error.data
      });
    }

    logger.error('Error checking storage quota', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to validate recording duration
 */
export async function validateRecordingDuration(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const body = request.body as any;
    const user = (request as any).user;

    if (!body.metadata?.duration) {
      return; // No duration to validate
    }

    const prisma = Container.get(PrismaService);
    const userWithSub = await prisma.user.findUnique({
      where: { id: user.id },
      include: { subscription: true }
    });

    const tier = userWithSub?.subscription?.plan || 'free';
    const maxDurationSeconds = {
      free: 60,      // 1 minute
      pro: 300,      // 5 minutes
      premium: 600   // 10 minutes
    }[tier] || 60;

    if (body.metadata.duration > maxDurationSeconds) {
      throw new AppError(
        `Recording duration (${body.metadata.duration}s) exceeds maximum allowed duration of ${maxDurationSeconds}s for ${tier} tier`,
        400,
        'DURATION_EXCEEDED',
        {
          duration: body.metadata.duration,
          maxDuration: maxDurationSeconds,
          tier
        }
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        message: error.message,
        code: error.code,
        data: error.data
      });
    }

    logger.error('Error validating recording duration', error as Error);
    return reply.status(500).send({
      status: 'error',
      message: 'Internal server error'
    });
  }
}