import { FastifyInstance } from 'fastify';
import { Container } from 'typedi';
import { PracticeSessionController } from './practice-session.controller';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';
import { rateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';

export default async function practiceSessionRoutes(fastify: FastifyInstance) {
  const controller = Container.get(PracticeSessionController);

  // Apply auth middleware to all routes
  fastify.addHook('onRequest', authMiddleware);

  // Create a new practice session
  fastify.post('/create', {
    preHandler: [
      rateLimitMiddleware({
        max: 20,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-create:${(req as any).user.id}`
      })
    ],
    handler: controller.createSession.bind(controller)
  });

  // Save session state
  fastify.put('/:sessionId/state', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '1 minute',
        keyGenerator: (req) => `practice-session-state:${(req as any).user.id}`
      })
    ],
    handler: controller.saveState.bind(controller)
  });

  // Resume a session
  fastify.get('/:sessionId/resume', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-resume:${(req as any).user.id}`
      })
    ],
    handler: controller.resumeSession.bind(controller)
  });

  // Get session history
  fastify.get('/history', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-history:${(req as any).user.id}`
      })
    ],
    handler: controller.getHistory.bind(controller)
  });

  // Update session settings
  fastify.patch('/:sessionId/settings', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-settings:${(req as any).user.id}`
      })
    ],
    handler: controller.updateSettings.bind(controller)
  });

  // Get session analytics
  fastify.get('/:sessionId/analytics', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-analytics:${(req as any).user.id}`
      })
    ],
    handler: controller.getAnalytics.bind(controller)
  });

  // Export session data
  fastify.post('/export', {
    preHandler: [
      rateLimitMiddleware({
        max: 10,
        timeWindow: '1 hour',
        keyGenerator: (req) => `practice-session-export:${(req as any).user.id}`
      })
    ],
    handler: controller.exportSession.bind(controller)
  });

  // Batch operations
  fastify.post('/batch', {
    preHandler: [
      rateLimitMiddleware({
        max: 5,
        timeWindow: '1 hour',
        keyGenerator: (req) => `practice-session-batch:${(req as any).user.id}`
      })
    ],
    handler: controller.batchOperation.bind(controller)
  });

  // End a session
  fastify.post('/:sessionId/end', {
    preHandler: [
      rateLimitMiddleware({
        max: 50,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-end:${(req as any).user.id}`
      })
    ],
    handler: controller.endSession.bind(controller)
  });

  // Get active session
  fastify.get('/active', {
    preHandler: [
      rateLimitMiddleware({
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (req) => `practice-session-active:${(req as any).user.id}`
      })
    ],
    handler: controller.getActiveSession.bind(controller)
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return reply.send({ status: 'ok', module: 'practice-session' });
  });
}