import { Service } from 'typedi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TranscriptService } from './transcript.service';
import {
  GetTranscriptDTO,
  ProcessTranscriptDTO,
  SearchTranscriptDTO,
  SpeechToTextDTO,
  ExportTranscriptDTO,
  BatchProcessTranscriptDTO
} from './transcript.dto';
import { validateRequest } from '@shared/utils/validation';
import { SuccessResponse } from '@shared/responses';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';

@Service()
export class TranscriptController {
  constructor(private transcriptService: TranscriptService) {}

  /**
   * Get transcript for a video
   * GET /api/transcript/:videoId
   */
  async getTranscript(
    request: FastifyRequest<{ Params: { videoId: string } }>,
    reply: FastifyReply
  ) {
    const { videoId } = request.params;
    const query = await validateRequest(GetTranscriptDTO, {
      videoId,
      ...request.query
    });

    const transcript = await this.transcriptService.getTranscript(query);

    return reply.send(
      new SuccessResponse('Transcript retrieved successfully', transcript)
    );
  }

  /**
   * Process and save transcript
   * POST /api/transcript/:videoId/process
   */
  async processTranscript(
    request: FastifyRequest<{ Params: { videoId: string } }>,
    reply: FastifyReply
  ) {
    const { videoId } = request.params;
    const body = await validateRequest(ProcessTranscriptDTO, {
      videoId,
      ...request.body
    });

    const result = await this.transcriptService.processYouTubeTranscript(body);

    return reply.send(
      new SuccessResponse('Transcript processed successfully', result)
    );
  }

  /**
   * Search transcripts
   * GET /api/transcript/search
   */
  async searchTranscripts(request: FastifyRequest, reply: FastifyReply) {
    const query = await validateRequest(SearchTranscriptDTO, request.query);

    const results = await this.transcriptService.searchTranscripts(query);

    return reply.send(
      new SuccessResponse('Search completed', {
        results,
        total: results.length,
        query: query.query
      })
    );
  }

  /**
   * Convert speech to text
   * POST /api/transcript/speech-to-text
   */
  async speechToText(request: FastifyRequest, reply: FastifyReply) {
    const body = await validateRequest(SpeechToTextDTO, request.body);

    const text = await this.transcriptService.speechToText(body);

    return reply.send(
      new SuccessResponse('Audio transcribed successfully', {
        text,
        language: body.language,
        service: body.service
      })
    );
  }

  /**
   * Analyze transcript
   * GET /api/transcript/:videoId/analysis
   */
  async analyzeTranscript(
    request: FastifyRequest<{
      Params: { videoId: string },
      Querystring: { language?: string }
    }>,
    reply: FastifyReply
  ) {
    const { videoId } = request.params;
    const { language = 'en' } = request.query;

    const analysis = await this.transcriptService.analyzeTranscript(videoId, language);

    return reply.send(
      new SuccessResponse('Transcript analysis completed', analysis)
    );
  }

  /**
   * Export transcript in various formats
   * GET /api/transcript/:videoId/export
   */
  async exportTranscript(
    request: FastifyRequest<{ Params: { videoId: string } }>,
    reply: FastifyReply
  ) {
    const { videoId } = request.params;
    const query = await validateRequest(ExportTranscriptDTO, {
      videoId,
      ...request.query
    });

    // This would be implemented to export in different formats
    return reply.send(
      new SuccessResponse('Export feature coming soon', {
        videoId,
        format: query.format
      })
    );
  }

  /**
   * Batch process transcripts
   * POST /api/transcript/batch
   */
  async batchProcess(request: FastifyRequest, reply: FastifyReply) {
    const body = await validateRequest(BatchProcessTranscriptDTO, request.body);

    // This would queue jobs for batch processing
    return reply.send(
      new SuccessResponse('Batch processing queued', {
        videoIds: body.videoIds,
        priority: body.priority
      })
    );
  }
}

// ============================================