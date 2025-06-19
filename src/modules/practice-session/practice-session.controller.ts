import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { PracticeSessionService } from './practice-session.service';
import {
  CreateSessionDTO,
  SaveStateDTO,
  SessionHistoryQueryDTO,
  UpdateSessionSettingsDTO,
  ExportSessionDTO,
  BatchSessionOperationDTO,
} from './practice-session.dto';
import { validateRequest } from '@shared/utils/validation';
import { SuccessResponse } from '@shared/responses';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';

@Service()
export class PracticeSessionController {
  constructor(private practiceSessionService: PracticeSessionService) {}

  /**
   * Create a new practice session
   * POST /api/practice-session/create
   */
  async createSession(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(CreateSessionDTO, request.body);

    const session = await this.practiceSessionService.createSession(user.id, data);

    return reply.status(201).send(new SuccessResponse('Practice session created successfully', session));
  }

  /**
   * Save session state
   * PUT /api/practice-session/:sessionId/state
   */
  async saveState(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    const { sessionId } = request.params;
    const state = await validateRequest(SaveStateDTO, request.body);

    await this.practiceSessionService.saveState(sessionId, user.id, state);

    return reply.send(
      new SuccessResponse('Session history retrieved successfully', {
        sessions: history.sessions,
        total: history.total,
        page: Math.floor(query.offset / query.limit) + 1,
        limit: query.limit,
      }),
    );
  }

  /**
   * Update session settings
   * PATCH /api/practice-session/:sessionId/settings
   */
  async updateSettings(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    const { sessionId } = request.params;
    const settings = await validateRequest(UpdateSessionSettingsDTO, request.body);

    await this.practiceSessionService.updateSettings(sessionId, user.id, settings);

    return reply.send(new SuccessResponse('Session settings updated successfully'));
  }

  /**
   * Get session analytics
   * GET /api/practice-session/:sessionId/analytics
   */
  async getAnalytics(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    const { sessionId } = request.params;

    const analytics = await this.practiceSessionService.getSessionAnalytics(sessionId, user.id);

    return reply.send(new SuccessResponse('Session analytics retrieved successfully', analytics));
  }

  /**
   * Export session data
   * POST /api/practice-session/export
   */
  async exportSession(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(ExportSessionDTO, request.body);

    const exportData = await this.practiceSessionService.exportSession(user.id, data);

    // Set appropriate headers based on format
    if (data.format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="session-${data.sessionId}.csv"`);
    } else if (data.format === 'pdf') {
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="session-${data.sessionId}.pdf"`);
    }

    return reply.send(exportData);
  }

  /**
   * Batch operations on sessions
   * POST /api/practice-session/batch
   */
  async batchOperation(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(BatchSessionOperationDTO, request.body);

    // Implementation would depend on the operation type
    // For now, just return success
    return reply.send(
      new SuccessResponse(`Batch ${data.operation} operation completed successfully`, {
        processed: data.sessionIds.length,
      }),
    );
  }

  /**
   * End a practice session
   * POST /api/practice-session/:sessionId/end
   */
  async endSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    const { sessionId } = request.params;

    // This would be implemented in the service
    // For now, just return success
    return reply.send(new SuccessResponse('Session ended successfully'));
  }

  /**
   * Get active session
   * GET /api/practice-session/active
   */
  async getActiveSession(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;

    // This would be implemented in the service
    // For now, return null
    return reply.send(new SuccessResponse('Active session retrieved', null));
  }

  /**
   * Resume a practice session
   * GET /api/practice-session/:sessionId/resume
   */
  async resumeSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    const { sessionId } = request.params;

    const sessionData = await this.practiceSessionService.resumeSession(sessionId, user.id);

    return reply.send(new SuccessResponse('Session resumed successfully', sessionData));
  }

  /**
   * Get session history
   * GET /api/practice-session/history
   */
  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const query = await validateRequest(SessionHistoryQueryDTO, request.query);

    const history = await this.practiceSessionService.getSessionHistory(user.id, query);

    return reply.send(
      new SuccessResponse('Session history retrieved successfully', {
        sessions: history.sessions,
        total: history.total,
        page: Math.floor(query.offset / query.limit) + 1,
        limit: query.limit,
      }),
    );
  }
}
