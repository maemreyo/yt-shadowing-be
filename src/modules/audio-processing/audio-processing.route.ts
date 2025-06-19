import { FastifyInstance } from 'fastify';
import { Container } from 'typedi';
import { AudioProcessingController } from './audio-processing.controller';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';
import { rateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateFileSize } from './audio-processing.middleware';

export default async function audioProcessingRoutes(fastify: FastifyInstance) {
  const controller = Container.get(AudioProcessingController);

  // Apply auth middleware to all routes
  fastify.addHook('onRequest', authMiddleware);

  // Upload recording
  fastify.post('/upload', {
    preHandler: [
      validateFileSize,
      rateLimitMiddleware({
        max: 30,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-upload:${(req as any).user.id}`
      })
    ],
    config: {
      // Increase body size limit for audio uploads
      bodyLimit: 104857600 // 100MB
    },
    handler: controller.uploadRecording.bind(controller)
  });

  // Get recording details
  fastify.get('/:recordingId', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-get:${(req as any).user.id}`
      })
    ],
    handler: controller.getRecording.bind(controller)
  });

  // Process audio
  fastify.post('/:recordingId/process', {
    preHandler: [
      rateLimitMiddleware({
        max: 20,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-process:${(req as any).user.id}`
      })
    ],
    handler: controller.processAudio.bind(controller)
  });

  // Compare audio
  fastify.post('/compare', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-compare:${(req as any).user.id}`
      })
    ],
    handler: controller.compareAudio.bind(controller)
  });

  // Generate waveform (GET)
  fastify.get('/:recordingId/waveform', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-waveform:${(req as any).user.id}`
      })
    ],
    handler: controller.generateWaveform.bind(controller)
  });

  // Generate waveform (POST)
  fastify.post('/waveform', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-waveform:${(req as any).user.id}`
      })
    ],
    handler: controller.generateWaveform.bind(controller)
  });

  // Delete recording
  fastify.delete('/:recordingId', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-delete:${(req as any).user.id}`
      })
    ],
    handler: controller.deleteRecording.bind(controller)
  });

  // Get recording limits
  fastify.get('/limits', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-limits:${(req as any).user.id}`
      })
    ],
    handler: controller.getRecordingLimits.bind(controller)
  });

  // Export recording
  fastify.post('/export', {
    preHandler: [
      rateLimitMiddleware({
        max: 10,
        timeWindow: '1 hour',
        keyGenerator: (req) => `audio-export:${(req as any).user.id}`
      })
    ],
    handler: controller.exportRecording.bind(controller)
  });

  // Bulk operations
  fastify.post('/bulk', {
    preHandler: [
      rateLimitMiddleware({
        max: 5,
        timeWindow: '1 hour',
        keyGenerator: (req) => `audio-bulk:${(req as any).user.id}`
      })
    ],
    handler: controller.bulkOperation.bind(controller)
  });

  // Update quality settings
  fastify.put('/settings/quality', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-settings:${(req as any).user.id}`
      })
    ],
    handler: controller.updateQualitySettings.bind(controller)
  });

  // Get user's recordings
  fastify.get('/recordings', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `audio-recordings:${(req as any).user.id}`
      })
    ],
    handler: controller.getUserRecordings.bind(controller)
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return reply.send({ status: 'ok', module: 'audio-processing' });
  });
}