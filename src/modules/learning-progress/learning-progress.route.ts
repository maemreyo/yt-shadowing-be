// CREATED: 2025-06-20 - Route definitions for learning progress endpoints

import { FastifyInstance } from 'fastify';
import { Container } from 'typedi';
import { LearningProgressController } from './learning-progress.controller';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';
import { checkSubscription } from '@modules/billing/middleware/subscription.middleware';
import { rateLimiter } from '@shared/plugins/rate-limiter';

export default async function learningProgressRoutes(app: FastifyInstance) {
  const controller = Container.get(LearningProgressController);

  // Apply auth middleware to all routes
  app.addHook('preHandler', authMiddleware);

  // Track progress
  app.post('/track', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Track progress for a single sentence',
      body: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          videoId: { type: 'string' },
          sentenceIndex: { type: 'number', minimum: 0 },
          completed: { type: 'boolean' },
          difficultyMarked: { type: 'boolean' },
          attemptsCount: { type: 'number', minimum: 1 },
          score: { type: 'number', minimum: 0, maximum: 100 },
          timeSpent: { type: 'number', minimum: 0 },
          recordingId: { type: 'string' }
        },
        required: ['sessionId', 'videoId', 'sentenceIndex', 'completed', 'timeSpent']
      }
    },
    preHandler: rateLimiter({
      max: 300,
      timeWindow: '15 minutes'
    })
  }, controller.trackProgress.bind(controller));

  // Bulk update progress
  app.put('/bulk', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Update progress for multiple sentences',
      body: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          progress: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sentenceIndex: { type: 'number', minimum: 0 },
                completed: { type: 'boolean' },
                difficultyMarked: { type: 'boolean' },
                score: { type: 'number', minimum: 0, maximum: 100 },
                timeSpent: { type: 'number', minimum: 0 }
              },
              required: ['sentenceIndex', 'completed', 'timeSpent']
            }
          },
          totalTimeSpent: { type: 'number', minimum: 0 }
        },
        required: ['sessionId', 'progress', 'totalTimeSpent']
      }
    },
    preHandler: rateLimiter({
      max: 100,
      timeWindow: '15 minutes'
    })
  }, controller.updateBulkProgress.bind(controller));

  // Get analytics
  app.get('/analytics', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Get learning analytics',
      querystring: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year', 'all'],
            default: 'week'
          },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          groupBy: {
            type: 'string',
            enum: ['day', 'week', 'month']
          },
          videoId: { type: 'string' },
          metrics: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'totalSessions',
                'totalMinutes',
                'sentencesCompleted',
                'averageScore',
                'streakDays',
                'uniqueVideos',
                'difficultyDistribution',
                'progressRate'
              ]
            }
          }
        }
      }
    }
  }, controller.getAnalytics.bind(controller));

  // Generate report
  app.get('/report', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Generate comprehensive progress report',
      querystring: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['week', 'month', 'quarter', 'year', 'custom'],
            default: 'month'
          },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          includeRecommendations: { type: 'boolean', default: true },
          includeCharts: { type: 'boolean', default: true },
          format: {
            type: 'string',
            enum: ['json', 'pdf', 'html'],
            default: 'json'
          }
        },
        required: ['timeframe']
      }
    },
    preHandler: [
      checkSubscription,
      rateLimiter({
        max: 10,
        timeWindow: '60 minutes'
      })
    ]
  }, controller.generateReport.bind(controller));

  // Get recommendations
  app.get('/recommendations', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Get personalized video recommendations',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          difficulty: { type: 'number', minimum: 1, maximum: 5 },
          preferredDuration: {
            type: 'object',
            properties: {
              min: { type: 'number', minimum: 0 },
              max: { type: 'number', minimum: 0 }
            }
          },
          excludeWatched: { type: 'boolean', default: false },
          language: { type: 'string', minLength: 2, maxLength: 2, default: 'en' }
        }
      }
    }
  }, controller.getRecommendations.bind(controller));

  // Get streaks
  app.get('/streaks', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Get practice streak data',
      querystring: {
        type: 'object',
        properties: {
          includeHistory: { type: 'boolean', default: false },
          year: { type: 'number', minimum: 2020, maximum: 2100 },
          month: { type: 'number', minimum: 1, maximum: 12 }
        }
      }
    }
  }, controller.getStreaks.bind(controller));

  // Get milestones
  app.get('/milestones', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Get achieved milestones',
      querystring: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['streak', 'sentences', 'minutes', 'score', 'videos']
          },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, controller.getMilestones.bind(controller));

  // Get video summary
  app.get('/video/:videoId/summary', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Get learning summary for a specific video',
      params: {
        type: 'object',
        properties: {
          videoId: { type: 'string' }
        },
        required: ['videoId']
      }
    }
  }, controller.getVideoSummary.bind(controller));

  // Health check
  app.get('/health', {
    schema: {
      tags: ['Learning Progress'],
      summary: 'Learning Progress module health check'
    }
  }, controller.healthCheck.bind(controller));
}