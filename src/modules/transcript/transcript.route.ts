import { FastifyInstance } from 'fastify';
import { Container } from 'typedi';
import { TranscriptController } from './transcript.controller';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';
import { rateLimiter } from '@shared/middleware/rate-limiter';
import { checkSubscription } from '@shared/middleware/subscription.middleware';

export default async function transcriptRoutes(app: FastifyInstance) {
  const controller = Container.get(TranscriptController);

  // Apply auth middleware to all routes
  app.addHook('onRequest', authMiddleware);

  // Get transcript
  app.get('/:videoId', {
    schema: {
      tags: ['Transcript'],
      summary: 'Get transcript for a video',
      params: {
        type: 'object',
        properties: {
          videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' }
        },
        required: ['videoId']
      },
      querystring: {
        type: 'object',
        properties: {
          language: { type: 'string', minLength: 2, maxLength: 2, default: 'en' },
          forceRefresh: { type: 'boolean', default: false },
          includeTimestamps: { type: 'boolean', default: true },
          includeWordLevel: { type: 'boolean', default: false }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                videoId: { type: 'string' },
                language: { type: 'string' },
                sentences: { type: 'array' },
                fullText: { type: 'string' },
                wordCount: { type: 'number' },
                duration: { type: 'number' },
                difficulty: { type: 'number' }
              }
            }
          }
        }
      }
    },
    preHandler: rateLimiter({
      max: 100,
      timeWindow: '15 minutes'
    })
  }, controller.getTranscript.bind(controller));

  // Process transcript
  app.post('/:videoId/process', {
    schema: {
      tags: ['Transcript'],
      summary: 'Process and save transcript for a video',
      params: {
        type: 'object',
        properties: {
          videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' }
        },
        required: ['videoId']
      },
      body: {
        type: 'object',
        properties: {
          language: { type: 'string', minLength: 2, maxLength: 2, default: 'en' },
          source: {
            type: 'string',
            enum: ['youtube', 'whisper', 'manual', 'assemblyai'],
            default: 'youtube'
          },
          sentences: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                startTime: { type: 'number' },
                endTime: { type: 'number' },
                confidence: { type: 'number' }
              }
            }
          },
          fullText: { type: 'string' },
          autoSegment: { type: 'boolean', default: true },
          saveToDatabase: { type: 'boolean', default: true }
        }
      }
    },
    preHandler: [
      checkSubscription,
      rateLimiter({
        max: 20,
        timeWindow: '15 minutes'
      })
    ]
  }, controller.processTranscript.bind(controller));

  // Search transcripts
  app.get('/search', {
    schema: {
      tags: ['Transcript'],
      summary: 'Search transcripts for practice content',
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 100 },
          language: { type: 'string', minLength: 2, maxLength: 2 },
          difficultyLevel: { type: 'number', minimum: 1, maximum: 5 },
          minDuration: { type: 'number', minimum: 0 },
          maxDuration: { type: 'number', maximum: 3600 },
          tags: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          sortBy: {
            type: 'string',
            enum: ['relevance', 'difficulty', 'duration', 'date'],
            default: 'relevance'
          }
        },
        required: ['query']
      }
    }
  }, controller.searchTranscripts.bind(controller));

  // Speech to text
  app.post('/speech-to-text', {
    schema: {
      tags: ['Transcript'],
      summary: 'Convert audio to text',
      body: {
        type: 'object',
        properties: {
          audioUrl: { type: 'string', format: 'uri' },
          audioData: { type: 'string' }, // Base64
          language: { type: 'string', minLength: 2, maxLength: 2, default: 'en' },
          service: {
            type: 'string',
            enum: ['whisper', 'google', 'assemblyai', 'auto'],
            default: 'auto'
          },
          enhanceAccuracy: { type: 'boolean', default: true },
          includeWordTimestamps: { type: 'boolean', default: false },
          speakerDiarization: { type: 'boolean', default: false }
        }
      }
    },
    preHandler: [
      checkSubscription,
      rateLimiter({
        max: 30,
        timeWindow: '60 minutes'
      })
    ]
  }, controller.speechToText.bind(controller));

  // Analyze transcript
  app.get('/:videoId/analysis', {
    schema: {
      tags: ['Transcript'],
      summary: 'Analyze transcript for learning insights',
      params: {
        type: 'object',
        properties: {
          videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' }
        },
        required: ['videoId']
      },
      querystring: {
        type: 'object',
        properties: {
          language: { type: 'string', minLength: 2, maxLength: 2, default: 'en' }
        }
      }
    },
    preHandler: checkSubscription
  }, controller.analyzeTranscript.bind(controller));

  // Export transcript
  app.get('/:videoId/export', {
    schema: {
      tags: ['Transcript'],
      summary: 'Export transcript in various formats',
      params: {
        type: 'object',
        properties: {
          videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' }
        },
        required: ['videoId']
      },
      querystring: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['srt', 'vtt', 'txt', 'json', 'pdf'],
            default: 'srt'
          },
          includeTranslation: { type: 'boolean', default: false },
          targetLanguage: { type: 'string', minLength: 2, maxLength: 2 },
          includeTimestamps: { type: 'boolean', default: true },
          includeDifficulty: { type: 'boolean', default: false }
        }
      }
    },
    preHandler: checkSubscription
  }, controller.exportTranscript.bind(controller));

  // Batch process
  app.post('/batch', {
    schema: {
      tags: ['Transcript'],
      summary: 'Batch process multiple transcripts',
      body: {
        type: 'object',
        properties: {
          videoIds: {
            type: 'array',
            items: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' },
            minItems: 1,
            maxItems: 10
          },
          language: { type: 'string', minLength: 2, maxLength: 2, default: 'en' },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
            default: 'normal'
          },
          notifyOnComplete: { type: 'boolean', default: false }
        },
        required: ['videoIds']
      }
    },
    preHandler: [
      checkSubscription,
      rateLimiter({
        max: 5,
        timeWindow: '60 minutes'
      })
    ]
  }, controller.batchProcess.bind(controller));

  // Health check
  app.get('/health', {
    schema: {
      tags: ['Transcript'],
      summary: 'Transcript module health check'
    }
  }, async (request, reply) => {
    return reply.send({
      success: true,
      message: 'Transcript module is healthy',
      data: {
        service: 'transcript',
        status: 'operational',
        features: {
          youtube: true,
          whisper: !!process.env.OPENAI_WHISPER_API_KEY,
          google: !!process.env.GOOGLE_SPEECH_API_KEY,
          assemblyai: !!process.env.ASSEMBLYAI_API_KEY
        },
        timestamp: new Date()
      }
    });
  });
}

// ============================================