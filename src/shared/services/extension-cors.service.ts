// CORS configuration for Chrome extension integration

import { Service } from 'typedi';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { ConfigService } from '@shared/services/config.service';
import { logger } from '@shared/logger';

export interface ExtensionCorsConfig {
  origin: string[] | ((origin: string) => boolean);
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
  preflightContinue: boolean;
  optionsSuccessStatus: number;
}

@Service()
export class ExtensionCorsService {
  private readonly CHROME_EXTENSION_PATTERNS = [
    /^chrome-extension:\/\/[a-z]{32}$/, // Chrome extension ID pattern
    /^moz-extension:\/\/[a-f0-9-]{36}$/, // Firefox extension ID pattern
    /^safari-extension:\/\/[a-z0-9-]+$/i, // Safari extension pattern
    /^edge-extension:\/\/[a-z]{32}$/ // Edge extension pattern
  ];

  constructor(private configService: ConfigService) {}

  /**
   * Get CORS configuration for Chrome extension
   */
  getExtensionCorsConfig(): ExtensionCorsConfig {
    const allowedExtensionIds = this.getAllowedExtensionIds();
    const allowedOrigins = this.getAllowedOrigins();

    return {
      origin: (origin: string) => this.validateOrigin(origin, allowedExtensionIds, allowedOrigins),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Extension-Id',
        'X-Extension-Version',
        'X-Client-Version',
        'X-Request-Id',
        'X-User-Agent'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Request-Id',
        'X-Response-Time'
      ],
      maxAge: 86400, // 24 hours
      preflightContinue: false,
      optionsSuccessStatus: 204
    };
  }

  /**
   * Configure CORS for Fastify app
   */
  async configureCors(app: FastifyInstance): Promise<void> {
    const corsConfig = this.getExtensionCorsConfig();

    // Register CORS plugin
    await app.register(require('@fastify/cors'), {
      ...corsConfig,
      hook: 'preHandler'
    });

    // Add custom CORS headers for extensions
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;

      if (origin && this.isExtensionOrigin(origin)) {
        // Add extension-specific headers
        reply.headers({
          'X-Extension-API-Version': '1.0.0',
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
      }
    });

    // Handle preflight requests
    app.options('/*', async (request, reply) => {
      const origin = request.headers.origin;

      if (origin && this.validateOrigin(origin, this.getAllowedExtensionIds(), this.getAllowedOrigins())) {
        reply
          .code(204)
          .headers({
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': corsConfig.methods.join(', '),
            'Access-Control-Allow-Headers': corsConfig.allowedHeaders.join(', '),
            'Access-Control-Max-Age': corsConfig.maxAge.toString()
          })
          .send();
      } else {
        reply.code(403).send({ error: 'Origin not allowed' });
      }
    });

    logger.info('Extension CORS configured', {
      allowedExtensions: this.getAllowedExtensionIds().length,
      allowedOrigins: this.getAllowedOrigins().length
    });
  }

  /**
   * Validate request origin
   */
  private validateOrigin(
    origin: string,
    allowedExtensionIds: string[],
    allowedOrigins: string[]
  ): boolean {
    // Check if it's an allowed web origin
    if (allowedOrigins.includes(origin)) {
      return true;
    }

    // Check if it's a valid extension origin
    if (this.isExtensionOrigin(origin)) {
      // Extract extension ID
      const extensionId = this.extractExtensionId(origin);

      // In development, allow any extension
      if (this.configService.get('NODE_ENV') === 'development') {
        logger.debug('Extension origin allowed (dev mode)', { origin, extensionId });
        return true;
      }

      // In production, check whitelist
      if (extensionId && allowedExtensionIds.includes(extensionId)) {
        return true;
      }

      logger.warn('Unknown extension origin', { origin, extensionId });
    }

    return false;
  }

  /**
   * Check if origin is from browser extension
   */
  private isExtensionOrigin(origin: string): boolean {
    return this.CHROME_EXTENSION_PATTERNS.some(pattern => pattern.test(origin));
  }

  /**
   * Extract extension ID from origin
   */
  private extractExtensionId(origin: string): string | null {
    // Chrome extension
    const chromeMatch = origin.match(/^chrome-extension:\/\/([a-z]{32})$/);
    if (chromeMatch) return chromeMatch[1];

    // Firefox extension
    const firefoxMatch = origin.match(/^moz-extension:\/\/([a-f0-9-]{36})$/);
    if (firefoxMatch) return firefoxMatch[1];

    // Edge extension
    const edgeMatch = origin.match(/^edge-extension:\/\/([a-z]{32})$/);
    if (edgeMatch) return edgeMatch[1];

    // Safari extension
    const safariMatch = origin.match(/^safari-extension:\/\/([a-z0-9-]+)$/i);
    if (safariMatch) return safariMatch[1];

    return null;
  }

  /**
   * Get allowed extension IDs from config
   */
  private getAllowedExtensionIds(): string[] {
    const ids = this.configService.get('ALLOWED_EXTENSION_IDS') || '';
    return ids.split(',').map(id => id.trim()).filter(Boolean);
  }

  /**
   * Get allowed web origins
   */
  private getAllowedOrigins(): string[] {
    const origins = this.configService.get('ALLOWED_ORIGINS') || '';
    const defaults = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://app.yourshadowing.com'
    ];

    const configured = origins.split(',').map(o => o.trim()).filter(Boolean);
    return [...defaults, ...configured];
  }

  /**
   * Verify extension request
   */
  async verifyExtensionRequest(request: FastifyRequest): Promise<{
    valid: boolean;
    extensionId?: string;
    version?: string;
    reason?: string;
  }> {
    const origin = request.headers.origin;
    const extensionId = request.headers['x-extension-id'] as string;
    const extensionVersion = request.headers['x-extension-version'] as string;

    // Must have origin
    if (!origin) {
      return {
        valid: false,
        reason: 'Missing origin header'
      };
    }

    // Must be extension origin
    if (!this.isExtensionOrigin(origin)) {
      return {
        valid: false,
        reason: 'Invalid origin'
      };
    }

    // Extract and verify extension ID
    const extractedId = this.extractExtensionId(origin);
    if (!extractedId) {
      return {
        valid: false,
        reason: 'Invalid extension ID'
      };
    }

    // Verify header matches origin
    if (extensionId && extensionId !== extractedId) {
      logger.warn('Extension ID mismatch', {
        origin,
        extractedId,
        headerExtensionId: extensionId
      });

      return {
        valid: false,
        reason: 'Extension ID mismatch'
      };
    }

    // Check if extension is allowed
    const allowedIds = this.getAllowedExtensionIds();
    if (this.configService.get('NODE_ENV') !== 'development' &&
        allowedIds.length > 0 &&
        !allowedIds.includes(extractedId)) {
      return {
        valid: false,
        extensionId: extractedId,
        reason: 'Extension not whitelisted'
      };
    }

    return {
      valid: true,
      extensionId: extractedId,
      version: extensionVersion
    };
  }

  /**
   * Create extension verification middleware
   */
  createExtensionMiddleware() {
    return async (request: FastifyRequest, reply: any) => {
      const verification = await this.verifyExtensionRequest(request);

      if (!verification.valid) {
        logger.warn('Extension request rejected', {
          reason: verification.reason,
          origin: request.headers.origin,
          ip: request.ip
        });

        reply.code(403).send({
          error: 'Extension verification failed',
          message: verification.reason
        });

        return;
      }

      // Add extension info to request
      (request as any).extension = {
        id: verification.extensionId,
        version: verification.version
      };
    };
  }
}
