// CDN service for audio file delivery optimization

import { Service } from 'typedi';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@shared/services/config.service';
import { logger } from '@shared/logger';
import * as crypto from 'crypto';
import * as path from 'path';

export interface CDNUploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  acl?: 'private' | 'public-read';
  expiresIn?: number; // For signed URLs
}

export interface CDNAudioInfo {
  url: string;
  cdnUrl?: string;
  signedUrl?: string;
  size: number;
  etag: string;
  lastModified: Date;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface CDNStats {
  totalFiles: number;
  totalSize: number;
  bandwidthUsed: number;
  cacheHitRate: number;
}

@Service()
export class AudioCDNService {
  private s3Client: S3Client;
  private cloudFrontClient: CloudFrontClient;

  private readonly BUCKET_NAME: string;
  private readonly CDN_DOMAIN: string;
  private readonly CLOUDFRONT_DISTRIBUTION_ID: string;
  private readonly CACHE_CONTROL_SETTINGS = {
    recordings: 'public, max-age=31536000, immutable', // 1 year
    waveforms: 'public, max-age=604800', // 1 week
    temp: 'public, max-age=3600' // 1 hour
  };

  constructor(private configService: ConfigService) {
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')!
      }
    });

    // Initialize CloudFront client
    this.cloudFrontClient = new CloudFrontClient({
      region: this.configService.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')!
      }
    });

    this.BUCKET_NAME = this.configService.get('S3_AUDIO_BUCKET') || 'youtube-shadowing-audio';
    this.CDN_DOMAIN = this.configService.get('CLOUDFRONT_DOMAIN') || 'd1234567890.cloudfront.net';
    this.CLOUDFRONT_DISTRIBUTION_ID = this.configService.get('CLOUDFRONT_DISTRIBUTION_ID') || '';
  }

  /**
   * Upload audio file to CDN
   */
  async uploadAudio(
    key: string,
    buffer: Buffer,
    options: CDNUploadOptions = {}
  ): Promise<CDNAudioInfo> {
    try {
      // Determine content type
      const contentType = options.contentType || this.getContentType(key);

      // Calculate hash for ETag
      const hash = crypto.createHash('md5').update(buffer).digest('hex');

      // Prepare S3 upload parameters
      const uploadParams = {
        Bucket: this.BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: options.cacheControl || this.getCacheControl(key),
        Metadata: {
          ...options.metadata,
          uploadedAt: new Date().toISOString(),
          size: buffer.length.toString()
        },
        ACL: options.acl || 'private'
      };

      // Upload to S3
      await this.s3Client.send(new PutObjectCommand(uploadParams));

      logger.info('Audio uploaded to CDN', {
        key,
        size: buffer.length,
        contentType
      });

      // Get CDN URLs
      const cdnUrl = this.getCDNUrl(key);
      let signedUrl;

      if (options.acl === 'private' || options.expiresIn) {
        signedUrl = await this.generateSignedUrl(key, options.expiresIn || 3600);
      }

      return {
        url: this.getS3Url(key),
        cdnUrl,
        signedUrl,
        size: buffer.length,
        etag: hash,
        lastModified: new Date(),
        cacheControl: uploadParams.CacheControl,
        metadata: uploadParams.Metadata
      };
    } catch (error) {
      logger.error('Failed to upload audio to CDN', error as Error);
      throw error;
    }
  }

  /**
   * Upload audio with optimized settings for different types
   */
  async uploadRecording(
    userId: string,
    recordingId: string,
    buffer: Buffer
  ): Promise<CDNAudioInfo> {
    const key = this.getRecordingKey(userId, recordingId);

    return this.uploadAudio(key, buffer, {
      contentType: 'audio/webm',
      cacheControl: this.CACHE_CONTROL_SETTINGS.recordings,
      metadata: {
        userId,
        recordingId,
        type: 'user-recording'
      },
      acl: 'private'
    });
  }

  /**
   * Upload waveform data
   */
  async uploadWaveform(
    recordingId: string,
    waveformData: any
  ): Promise<CDNAudioInfo> {
    const key = this.getWaveformKey(recordingId);
    const buffer = Buffer.from(JSON.stringify(waveformData));

    return this.uploadAudio(key, buffer, {
      contentType: 'application/json',
      cacheControl: this.CACHE_CONTROL_SETTINGS.waveforms,
      metadata: {
        recordingId,
        type: 'waveform'
      },
      acl: 'public-read'
    });
  }

  /**
   * Get signed URL for private content
   */
  async generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: key
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

      // Convert S3 URL to CDN URL if CloudFront is configured
      if (this.CDN_DOMAIN) {
        const url = new URL(signedUrl);
        const cdnUrl = `https://${this.CDN_DOMAIN}${url.pathname}${url.search}`;
        return cdnUrl;
      }

      return signedUrl;
    } catch (error) {
      logger.error('Failed to generate signed URL', error as Error);
      throw error;
    }
  }

  /**
   * Delete audio from CDN
   */
  async deleteAudio(key: string): Promise<void> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: key
      }));

      // Invalidate CDN cache
      await this.invalidateCache([key]);

      logger.info('Audio deleted from CDN', { key });
    } catch (error) {
      logger.error('Failed to delete audio from CDN', error as Error);
      throw error;
    }
  }

  /**
   * Batch delete audio files
   */
  async deleteMultiple(keys: string[]): Promise<void> {
    try {
      // S3 batch delete (max 1000 objects per request)
      const chunks = this.chunkArray(keys, 1000);

      for (const chunk of chunks) {
        const deletePromises = chunk.map(key =>
          this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.BUCKET_NAME,
            Key: key
          }))
        );

        await Promise.all(deletePromises);
      }

      // Invalidate CDN cache
      await this.invalidateCache(keys);

      logger.info('Multiple audio files deleted from CDN', { count: keys.length });
    } catch (error) {
      logger.error('Failed to delete multiple audio files', error as Error);
      throw error;
    }
  }

  /**
   * Invalidate CDN cache
   */
  async invalidateCache(paths: string[]): Promise<void> {
    if (!this.CLOUDFRONT_DISTRIBUTION_ID) {
      return;
    }

    try {
      const invalidationPaths = paths.map(path => `/${path}`);

      await this.cloudFrontClient.send(new CreateInvalidationCommand({
        DistributionId: this.CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: Date.now().toString(),
          Paths: {
            Quantity: invalidationPaths.length,
            Items: invalidationPaths
          }
        }
      }));

      logger.info('CDN cache invalidated', { paths: invalidationPaths });
    } catch (error) {
      logger.error('Failed to invalidate CDN cache', error as Error);
    }
  }

  /**
   * Get CDN statistics
   */
  async getStats(): Promise<CDNStats> {
    // This would typically integrate with CloudWatch or your CDN provider's API
    // For now, return mock data
    return {
      totalFiles: 0,
      totalSize: 0,
      bandwidthUsed: 0,
      cacheHitRate: 0
    };
  }

  /**
   * Optimize audio file for CDN delivery
   */
  async optimizeAudioForDelivery(
    buffer: Buffer,
    format: 'webm' | 'mp3' | 'aac' = 'webm'
  ): Promise<Buffer> {
    // This would use ffmpeg to optimize the audio
    // For now, return the original buffer
    // In production, you'd want to:
    // 1. Compress audio to optimal bitrate
    // 2. Convert to efficient format
    // 3. Strip unnecessary metadata

    logger.info('Audio optimization requested', { format, size: buffer.length });
    return buffer;
  }

  /**
   * Setup CDN optimization rules
   */
  async setupCDNRules(): Promise<void> {
    // Configure CloudFront behaviors for optimal delivery
    // This would typically be done through infrastructure as code

    const rules = {
      '/recordings/*': {
        ttl: 31536000, // 1 year
        compress: true,
        headers: ['Origin', 'Access-Control-Request-Method']
      },
      '/waveforms/*': {
        ttl: 604800, // 1 week
        compress: true,
        headers: ['Origin']
      },
      '/temp/*': {
        ttl: 3600, // 1 hour
        compress: false
      }
    };

    logger.info('CDN rules configured', rules);
  }

  // Helper methods

  private getRecordingKey(userId: string, recordingId: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `recordings/${year}/${month}/${userId}/${recordingId}.webm`;
  }

  private getWaveformKey(recordingId: string): string {
    return `waveforms/${recordingId}.json`;
  }

  private getS3Url(key: string): string {
    return `https://${this.BUCKET_NAME}.s3.amazonaws.com/${key}`;
  }

  private getCDNUrl(key: string): string {
    if (!this.CDN_DOMAIN) {
      return this.getS3Url(key);
    }
    return `https://${this.CDN_DOMAIN}/${key}`;
  }

  private getContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.webm': 'audio/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.json': 'application/json'
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  private getCacheControl(key: string): string {
    if (key.includes('recordings/')) {
      return this.CACHE_CONTROL_SETTINGS.recordings;
    } else if (key.includes('waveforms/')) {
      return this.CACHE_CONTROL_SETTINGS.waveforms;
    }
    return this.CACHE_CONTROL_SETTINGS.temp;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Migrate existing audio files to CDN
   */
  async migrateExistingAudio(
    localFiles: Array<{ path: string; userId: string; recordingId: string }>
  ): Promise<void> {
    logger.info('Starting audio migration to CDN', { count: localFiles.length });

    const results = await Promise.allSettled(
      localFiles.map(async (file) => {
        const fs = await import('fs/promises');
        const buffer = await fs.readFile(file.path);

        return this.uploadRecording(file.userId, file.recordingId, buffer);
      })
    );

    const stats = results.reduce((acc, result) => {
      if (result.status === 'fulfilled') {
        acc.success++;
      } else {
        acc.failed++;
        logger.error('Migration failed for file', result.reason);
      }
      return acc;
    }, { success: 0, failed: 0 });

    logger.info('Audio migration completed', stats);
  }
}
