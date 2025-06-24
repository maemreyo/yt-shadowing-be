// Comprehensive security configuration for YouTube Shadowing

import { FastifyInstance } from 'fastify';
import { Container } from 'typedi';
import { AudioValidationService } from '@shared/services/audio-validation.service';
import { VirusScannerService } from '@shared/services/virus-scanner.service';
import { ShadowingRateLimiterService } from '@shared/services/shadowing-rate-limiter.service';
import { ExtensionCorsService } from '@shared/services/extension-cors.service';
import { logger } from '@shared/logger';

export interface SecurityConfig {
  audioValidation: {
    enabled: boolean;
    maxFileSize: number;
    maxDuration: number;
    allowedFormats: string[];
    scanForMalware: boolean;
  };
  virusScanning: {
    enabled: boolean;
    quarantine: boolean;
    removeInfected: boolean;
  };
  rateLimiting: {
    enabled: boolean;
    customLimits?: any;
  };
  cors: {
    enabled: boolean;
    allowedExtensions: string[];
  };
}

/**
 * Configure all security features for YouTube Shadowing
 */
export async function configureShadowingSecurity(
  app: FastifyInstance,
  config?: Partial<SecurityConfig>
): Promise<void> {
  logger.info('Configuring YouTube Shadowing security features');

  const defaultConfig: SecurityConfig = {
    audioValidation: {
      enabled: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxDuration: 300, // 5 minutes
      allowedFormats: ['mp3', 'wav', 'webm', 'ogg', 'm4a', 'aac'],
      scanForMalware: true
    },
    virusScanning: {
      enabled: true,
      quarantine: true,
      removeInfected: false
    },
    rateLimiting: {
      enabled: true
    },
    cors: {
      enabled: true,
      allowedExtensions: []
    }
  };

  const finalConfig = { ...defaultConfig, ...config };

  // 1. Initialize virus scanner
  if (finalConfig.virusScanning.enabled) {
    try {
      const virusScanner = Container.get(VirusScannerService);
      await virusScanner.initialize();
      logger.info('Virus scanner initialized');
    } catch (error) {
      logger.error('Failed to initialize virus scanner', error as Error);
    }
  }

  // 2. Configure CORS for extensions
  if (finalConfig.cors.enabled) {
    const corsService = Container.get(ExtensionCorsService);
    await corsService.configureCors(app);
    logger.info('Extension CORS configured');
  }

  // 3. Apply rate limiting
  if (finalConfig.rateLimiting.enabled) {
    const rateLimiter = Container.get(ShadowingRateLimiterService);
    rateLimiter.applyShadowingRateLimits(app);
    logger.info('Rate limiting configured');
  }

  // 4. Add audio validation middleware
  if (finalConfig.audioValidation.enabled) {
    app.addHook('preHandler', createAudioValidationHook(finalConfig.audioValidation));
    logger.info('Audio validation configured');
  }

  // 5. Add security headers
  app.addHook('onSend', async (request, reply) => {
    reply.headers({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': getCSPHeader(request)
    });
  });

  logger.info('YouTube Shadowing security configuration complete');
}

/**
 * Create audio validation hook
 */
function createAudioValidationHook(config: SecurityConfig['audioValidation']) {
  const audioValidator = Container.get(AudioValidationService);
  const virusScanner = Container.get(VirusScannerService);

  return async (request: any, reply: any) => {
    // Only validate on audio upload endpoints
    const audioUploadPaths = [
      '/api/audio/upload',
      '/api/recordings/upload',
      '/api/practice-session/recording'
    ];

    if (!audioUploadPaths.some(path => request.url.includes(path))) {
      return;
    }

    // Check if request has file
    const file = request.file || request.files?.[0];
    if (!file) return;

    try {
      // Validate audio file
      const validationResult = await audioValidator.validateAudioBuffer(
        file.buffer,
        file.filename,
        {
          maxSizeBytes: config.maxFileSize,
          maxDurationSeconds: config.maxDuration,
          allowedFormats: config.allowedFormats,
          scanForMalware: config.scanForMalware
        }
      );

      if (!validationResult.valid) {
        logger.warn('Audio validation failed', {
          filename: file.filename,
          errors: validationResult.errors
        });

        reply.code(400).send({
          error: 'Invalid audio file',
          details: validationResult.errors
        });
        return;
      }

      // Virus scan if enabled
      if (config.scanForMalware) {
        const scanResult = await virusScanner.scanBuffer(file.buffer, file.filename);

        if (scanResult.infected) {
          logger.error('Virus detected in audio file', {
            filename: file.filename,
            malware: scanResult.malware
          });

          reply.code(400).send({
            error: 'Security threat detected',
            message: 'The uploaded file contains malicious content'
          });
          return;
        }
      }

      // Add validation results to request
      (request as any).audioValidation = validationResult;
    } catch (error) {
      logger.error('Audio security check failed', error as Error);

      reply.code(500).send({
        error: 'Security check failed',
        message: 'Unable to validate uploaded file'
      });
    }
  };
}

/**
 * Get Content Security Policy header
 */
function getCSPHeader(request: any): string {
  const isExtensionRequest = request.headers.origin?.startsWith('chrome-extension://');

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob: https://www.youtube.com",
    "connect-src 'self' https://www.youtube.com https://api.openai.com wss://localhost:* ws://localhost:*"
  ];

  // Add extension-specific CSP
  if (isExtensionRequest) {
    directives.push("frame-ancestors 'none'");
  }

  return directives.join('; ');
}

/**
 * Security event handlers
 */
export function setupSecurityEventHandlers(eventEmitter: any): void {
  // Handle virus detection
  eventEmitter.on('security:virus-detected', async (event: any) => {
    logger.error('SECURITY ALERT: Virus detected', event);

    // Notify admins
    eventEmitter.emit('notification:send-admin', {
      type: 'security_alert',
      severity: 'critical',
      title: 'Virus Detected',
      message: `Malware detected in file upload: ${event.malware}`,
      data: event
    });

    // Track security incident
    eventEmitter.emit('analytics:track', {
      event: 'security_incident',
      properties: {
        type: 'virus_detected',
        malware: event.malware,
        filePath: event.filePath
      }
    });
  });

  // Handle rate limit exceeded
  eventEmitter.on('security:rate-limit-exceeded', async (event: any) => {
    logger.warn('Rate limit exceeded', event);

    // Check for suspicious patterns
    if (event.count > 100) {
      eventEmitter.emit('notification:send-admin', {
        type: 'security_alert',
        severity: 'warning',
        title: 'Possible DDoS Attack',
        message: `User ${event.userId} exceeded rate limit ${event.count} times`,
        data: event
      });
    }
  });

  // Handle suspicious file uploads
  eventEmitter.on('security:suspicious-upload', async (event: any) => {
    logger.warn('Suspicious file upload detected', event);

    eventEmitter.emit('analytics:track', {
      userId: event.userId,
      event: 'suspicious_upload',
      properties: {
        filename: event.filename,
        reason: event.reason
      }
    });
  });
}

/**
 * Security monitoring utilities
 */
export const SecurityMonitor = {
  /**
   * Get security metrics
   */
  async getMetrics(): Promise<{
    virusScans: { total: number; infected: number };
    rateLimits: { exceeded: number; topOffenders: any[] };
    uploads: { total: number; rejected: number };
  }> {
    // This would query from database/cache
    return {
      virusScans: { total: 0, infected: 0 },
      rateLimits: { exceeded: 0, topOffenders: [] },
      uploads: { total: 0, rejected: 0 }
    };
  },

  /**
   * Get security status
   */
  async getStatus(): Promise<{
    virusScanner: { available: boolean; version?: string };
    rateLimiting: { active: boolean };
    audioValidation: { active: boolean };
  }> {
    const virusScanner = Container.get(VirusScannerService);
    const scannerStatus = await virusScanner.getStatus();

    return {
      virusScanner: scannerStatus,
      rateLimiting: { active: true },
      audioValidation: { active: true }
    };
  }
};
