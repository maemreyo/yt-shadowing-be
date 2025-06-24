// Route definitions for YouTube Shadowing billing

import { FastifyInstance } from 'fastify';
import { Container } from 'typedi';
import { ShadowingBillingController } from './shadowing-billing.controller';
import { authMiddleware } from '@modules/auth/middleware/auth.middleware';
import { rateLimiter } from '@shared/plugins/rate-limiter';

export default async function shadowingBillingRoutes(app: FastifyInstance) {
  const controller = Container.get(ShadowingBillingController);

  // Apply auth middleware to all routes
  app.addHook('preHandler', authMiddleware);

  // Get shadowing features
  app.get('/features', {
    schema: {
      tags: ['Shadowing Billing'],
      summary: 'Get YouTube Shadowing features for current plan',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                dailyMinutes: {
                  oneOf: [
                    { type: 'number' },
                    { type: 'string', enum: ['unlimited'] }
                  ]
                },
                maxRecordingsStored: {
                  oneOf: [
                    { type: 'number' },
                    { type: 'string', enum: ['unlimited'] }
                  ]
                },
                audioQuality: {
                  type: 'string',
                  enum: ['standard', 'high', 'studio']
                },
                speechToTextQuota: {
                  oneOf: [
                    { type: 'number' },
                    { type: 'string', enum: ['unlimited'] }
                  ]
                },
                exportFormats: {
                  type: 'array',
                  items: { type: 'string' }
                },
                features: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, controller.getShadowingFeatures.bind(controller));

  // Check feature availability
  app.get('/check-feature', {
    schema: {
      tags: ['Shadowing Billing'],
      summary: 'Check if user can use a specific shadowing feature',
      querystring: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            enum: ['practice', 'recording', 'speech_to_text', 'export', 'analytics']
          }
        },
        required: ['feature']
      }
    }
  }, controller.checkFeatureAvailability.bind(controller));

  // Track usage (internal/admin use)
  app.post('/track-usage', {
    schema: {
      tags: ['Shadowing Billing'],
      summary: 'Track usage for billing purposes',
      body: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['minutes', 'recordings', 'speech_to_text']
          },
          amount: {
            type: 'number',
            minimum: 0,
            default: 1
          },
          metadata: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              videoId: { type: 'string' },
              recordingId: { type: 'string' }
            }
          }
        },
        required: ['type']
      }
    },
    preHandler: rateLimiter({
      max: 1000,
      timeWindow: '15 minutes'
    })
  }, controller.trackUsage.bind(controller));

  // Get usage statistics
  app.get('/usage-stats', {
    schema: {
      tags: ['Shadowing Billing'],
      summary: 'Get detailed usage statistics',
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          groupBy: {
            type: 'string',
            enum: ['day', 'week', 'month']
          }
        }
      }
    }
  }, controller.getUsageStats.bind(controller));

  // Get usage summary
  app.get('/usage-summary', {
    schema: {
      tags: ['Shadowing Billing'],
      summary: 'Get usage summary for current billing period',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                period: {
                  type: 'object',
                  properties: {
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' }
                  }
                },
                plan: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                  }
                },
                usage: {
                  type: 'object',
                  properties: {
                    minutes: {
                      type: 'object',
                      properties: {
                        used: { type: 'number' },
                        limit: {
                          oneOf: [
                            { type: 'number' },
                            { type: 'string', enum: ['unlimited'] }
                          ]
                        },
                        percentUsed: { type: 'number' }
                      }
                    },
                    recordings: {
                      type: 'object',
                      properties: {
                        created: { type: 'number' },
                        stored: { type: 'number' },
                        limit: {
                          oneOf: [
                            { type: 'number' },
                            { type: 'string', enum: ['unlimited'] }
                          ]
                        }
                      }
                    },
                    speechToText: {
                      type: 'object',
                      properties: {
                        used: { type: 'number' },
                        limit: {
                          oneOf: [
                            { type: 'number' },
                            { type: 'string', enum: ['unlimited'] }
                          ]
                        },
                        percentUsed: { type: 'number' }
                      }
                    }
                  }
                },
                costs: {
                  type: 'object',
                  properties: {
                    included: { type: 'number' },
                    overage: { type: 'number' },
                    total: { type: 'number' },
                    currency: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, controller.getUsageSummary.bind(controller));

  // Health check
  app.get('/health', {
    schema: {
      tags: ['Shadowing Billing'],
      summary: 'Shadowing Billing service health check'
    }
  }, controller.healthCheck.bind(controller));
}
