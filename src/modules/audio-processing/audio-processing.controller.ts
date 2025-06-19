import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AudioProcessingService } from './audio-processing.service';
import {
  UploadRecordingDTO,
  ProcessAudioDTO,
  CompareAudioDTO,
  WaveformRequestDTO,
  ExportRecordingDTO,
  BulkAudioOperationDTO,
  AudioQualitySettingsDTO
} from './audio-processing.dto';
import { validateRequest } from '@shared/utils/validation';
import { SuccessResponse } from '@shared/responses';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';

@Service()
export class AudioProcessingController {
  constructor(private audioProcessingService: AudioProcessingService) {}

  /**
   * Upload a recording
   * POST /api/audio/upload
   */
  async uploadRecording(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(UploadRecordingDTO, request.body);

    const recording = await this.audioProcessingService.uploadRecording(user.id, data);

    return reply.status(201).send(
      new SuccessResponse('Recording uploaded successfully', recording)
    );
  }

  /**
   * Get recording details
   * GET /api/audio/:recordingId
   */
  async getRecording(
    request: FastifyRequest<{ Params: { recordingId: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    const { recordingId } = request.params;

    const recording = await this.audioProcessingService.getRecording(recordingId, user.id);

    return reply.send(
      new SuccessResponse('Recording retrieved successfully', recording)
    );
  }

  /**
   * Process audio
   * POST /api/audio/:recordingId/process
   */
  async processAudio(
    request: FastifyRequest<{ Params: { recordingId: string } }>,
    reply: FastifyReply
  ) {
    const { recordingId } = request.params;
    const body = await validateRequest(ProcessAudioDTO, {
      recordingId,
      ...request.body
    });

    await this.audioProcessingService.processAudio(body);

    return reply.send(
      new SuccessResponse('Audio processing started', { recordingId })
    );
  }

  /**
   * Compare audio recordings
   * POST /api/audio/compare
   */
  async compareAudio(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(CompareAudioDTO, request.body);

    const analysis = await this.audioProcessingService.compareAudio(user.id, data);

    return reply.send(
      new SuccessResponse('Audio comparison completed', analysis)
    );
  }

  /**
   * Generate waveform
   * GET /api/audio/:recordingId/waveform
   * POST /api/audio/waveform
   */
  async generateWaveform(request: FastifyRequest, reply: FastifyReply) {
    let data: WaveformRequestDTO;

    if (request.method === 'GET') {
      const params = request.params as { recordingId: string };
      data = await validateRequest(WaveformRequestDTO, {
        recordingId: params.recordingId,
        ...request.query
      });
    } else {
      data = await validateRequest(WaveformRequestDTO, request.body);
    }

    const waveform = await this.audioProcessingService.generateWaveformData(data);

    if (data.format === 'svg') {
      reply.header('Content-Type', 'image/svg+xml');
      return reply.send(waveform);
    }

    return reply.send(
      new SuccessResponse('Waveform generated successfully', { waveform })
    );
  }

  /**
   * Delete recording
   * DELETE /api/audio/:recordingId
   */
  async deleteRecording(
    request: FastifyRequest<{ Params: { recordingId: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    const { recordingId } = request.params;

    await this.audioProcessingService.deleteRecording(recordingId, user.id);

    return reply.send(
      new SuccessResponse('Recording deleted successfully')
    );
  }

  /**
   * Get recording limits
   * GET /api/audio/limits
   */
  async getRecordingLimits(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;

    const limits = await this.audioProcessingService.getRecordingLimits(user.id);

    return reply.send(
      new SuccessResponse('Recording limits retrieved', limits)
    );
  }

  /**
   * Export recording
   * POST /api/audio/export
   */
  async exportRecording(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(ExportRecordingDTO, request.body);

    // This would be implemented in the service
    // For now, just return success
    return reply.send(
      new SuccessResponse('Export initiated', {
        recordingId: data.recordingId,
        format: data.format
      })
    );
  }

  /**
   * Bulk operations
   * POST /api/audio/bulk
   */
  async bulkOperation(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const data = await validateRequest(BulkAudioOperationDTO, request.body);

    // This would be implemented in the service
    // For now, just return success
    return reply.send(
      new SuccessResponse(`Bulk ${data.operation} initiated`, {
        recordingIds: data.recordingIds,
        operation: data.operation
      })
    );
  }

  /**
   * Update quality settings
   * PUT /api/audio/settings/quality
   */
  async updateQualitySettings(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const settings = await validateRequest(AudioQualitySettingsDTO, request.body);

    // This would save user preferences
    // For now, just return the settings
    return reply.send(
      new SuccessResponse('Quality settings updated', settings)
    );
  }

  /**
   * Get user's recordings
   * GET /api/audio/recordings
   */
  async getUserRecordings(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const query = request.query as {
      sessionId?: string;
      limit?: string;
      offset?: string;
      status?: string;
    };

    // This would be implemented in the service
    // For now, return empty array
    return reply.send(
      new SuccessResponse('Recordings retrieved', {
        recordings: [],
        total: 0,
        limit: parseInt(query.limit || '20'),
        offset: parseInt(query.offset || '0')
      })
    );
  }
}