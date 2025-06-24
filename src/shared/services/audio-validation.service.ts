// Comprehensive audio file validation for security

import { Service } from 'typedi';
import { createReadStream } from 'fs';
import { promisify } from 'util';
import * as mmm from 'music-metadata';
import * as fileType from 'file-type';
import { logger } from '@shared/logger';
import { AppError } from '@shared/errors';
import * as crypto from 'crypto';

export interface AudioValidationResult {
  valid: boolean;
  fileType?: string;
  mimeType?: string;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  size: number;
  hash?: string;
  errors?: string[];
  warnings?: string[];
}

export interface AudioValidationOptions {
  maxSizeBytes?: number;
  maxDurationSeconds?: number;
  allowedFormats?: string[];
  allowedMimeTypes?: string[];
  minBitrate?: number;
  maxBitrate?: number;
  requireMonoChannel?: boolean;
  scanForMalware?: boolean;
  checkAudioIntegrity?: boolean;
}

@Service()
export class AudioValidationService {
  // Default validation rules
  private readonly DEFAULT_OPTIONS: AudioValidationOptions = {
    maxSizeBytes: 100 * 1024 * 1024, // 100MB
    maxDurationSeconds: 300, // 5 minutes
    allowedFormats: ['mp3', 'wav', 'webm', 'ogg', 'm4a', 'aac'],
    allowedMimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/aac',
      'audio/x-m4a'
    ],
    minBitrate: 32000, // 32 kbps
    maxBitrate: 320000, // 320 kbps
    requireMonoChannel: false,
    scanForMalware: true,
    checkAudioIntegrity: true
  };

  // Known malicious patterns in audio files
  private readonly MALICIOUS_PATTERNS = [
    { pattern: /eval\s*\(/, description: 'JavaScript eval detected' },
    { pattern: /<script/i, description: 'Script tag detected' },
    { pattern: /javascript:/i, description: 'JavaScript protocol detected' },
    { pattern: /on\w+\s*=/, description: 'Event handler detected' },
    { pattern: /\x00\x00\x00\x00IEND/, description: 'Suspicious PNG ending in audio' },
    { pattern: /\xFF\xD8\xFF/, description: 'JPEG signature in audio' }
  ];

  /**
   * Validate an audio file
   */
  async validateAudioFile(
    filePath: string,
    options: AudioValidationOptions = {}
  ): Promise<AudioValidationResult> {
    const validationOptions = { ...this.DEFAULT_OPTIONS, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Step 1: Check file exists and get size
      const stats = await this.getFileStats(filePath);
      const fileSize = stats.size;

      // Step 2: Validate file size
      if (fileSize > validationOptions.maxSizeBytes!) {
        errors.push(`File size ${this.formatBytes(fileSize)} exceeds maximum allowed ${this.formatBytes(validationOptions.maxSizeBytes!)}`);
      }

      if (fileSize === 0) {
        errors.push('File is empty');
        return { valid: false, size: 0, errors };
      }

      // Step 3: Detect file type
      const detectedType = await fileType.fromFile(filePath);
      if (!detectedType) {
        errors.push('Unable to detect file type');
        return { valid: false, size: fileSize, errors };
      }

      // Step 4: Validate file format
      const fileExt = detectedType.ext;
      const mimeType = detectedType.mime;

      if (!validationOptions.allowedFormats!.includes(fileExt)) {
        errors.push(`File format '${fileExt}' is not allowed. Allowed formats: ${validationOptions.allowedFormats!.join(', ')}`);
      }

      if (!validationOptions.allowedMimeTypes!.includes(mimeType)) {
        errors.push(`MIME type '${mimeType}' is not allowed`);
      }

      // Step 5: Parse audio metadata
      let metadata;
      try {
        metadata = await mmm.parseFile(filePath);
      } catch (metadataError) {
        errors.push('Failed to parse audio metadata. File may be corrupted.');
        return { valid: false, size: fileSize, fileType: fileExt, mimeType, errors };
      }

      // Step 6: Validate audio properties
      const format = metadata.format;
      const duration = format.duration || 0;
      const bitrate = format.bitrate || 0;
      const sampleRate = format.sampleRate || 0;
      const channels = format.numberOfChannels || 0;

      // Duration check
      if (duration > validationOptions.maxDurationSeconds!) {
        errors.push(`Duration ${Math.round(duration)}s exceeds maximum allowed ${validationOptions.maxDurationSeconds}s`);
      }

      // Bitrate check
      if (bitrate < validationOptions.minBitrate!) {
        warnings.push(`Low bitrate detected: ${Math.round(bitrate / 1000)}kbps. Audio quality may be poor.`);
      }

      if (bitrate > validationOptions.maxBitrate!) {
        warnings.push(`High bitrate detected: ${Math.round(bitrate / 1000)}kbps. Consider compressing for better performance.`);
      }

      // Channel check
      if (validationOptions.requireMonoChannel && channels > 1) {
        errors.push(`Audio must be mono (1 channel), but has ${channels} channels`);
      }

      // Step 7: Security checks
      if (validationOptions.scanForMalware) {
        const malwareCheck = await this.scanForMalware(filePath);
        if (!malwareCheck.safe) {
          errors.push(...malwareCheck.threats);
        }
      }

      // Step 8: Audio integrity check
      if (validationOptions.checkAudioIntegrity) {
        const integrityCheck = await this.checkAudioIntegrity(filePath, metadata);
        if (!integrityCheck.valid) {
          warnings.push(...integrityCheck.issues);
        }
      }

      // Step 9: Calculate file hash
      const hash = await this.calculateFileHash(filePath);

      // Compile result
      const result: AudioValidationResult = {
        valid: errors.length === 0,
        fileType: fileExt,
        mimeType,
        duration: Math.round(duration),
        bitrate: Math.round(bitrate),
        sampleRate,
        channels,
        size: fileSize,
        hash,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };

      // Log validation result
      logger.info('Audio file validation completed', {
        filePath,
        valid: result.valid,
        errors: errors.length,
        warnings: warnings.length
      });

      return result;
    } catch (error) {
      logger.error('Audio validation failed', error as Error);
      errors.push(`Validation error: ${(error as Error).message}`);
      return {
        valid: false,
        size: 0,
        errors
      };
    }
  }

  /**
   * Validate audio buffer (for in-memory validation)
   */
  async validateAudioBuffer(
    buffer: Buffer,
    fileName: string,
    options: AudioValidationOptions = {}
  ): Promise<AudioValidationResult> {
    const validationOptions = { ...this.DEFAULT_OPTIONS, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Size check
      const fileSize = buffer.length;
      if (fileSize > validationOptions.maxSizeBytes!) {
        errors.push(`File size ${this.formatBytes(fileSize)} exceeds maximum allowed ${this.formatBytes(validationOptions.maxSizeBytes!)}`);
      }

      // Detect file type from buffer
      const detectedType = await fileType.fromBuffer(buffer);
      if (!detectedType) {
        errors.push('Unable to detect file type from buffer');
        return { valid: false, size: fileSize, errors };
      }

      // Validate format
      const fileExt = detectedType.ext;
      const mimeType = detectedType.mime;

      if (!validationOptions.allowedFormats!.includes(fileExt)) {
        errors.push(`File format '${fileExt}' is not allowed`);
      }

      // Parse metadata from buffer
      let metadata;
      try {
        metadata = await mmm.parseBuffer(buffer, { mimeType });
      } catch (metadataError) {
        errors.push('Failed to parse audio metadata from buffer');
        return { valid: false, size: fileSize, fileType: fileExt, mimeType, errors };
      }

      // Continue with same validation as file
      const format = metadata.format;
      const duration = format.duration || 0;

      if (duration > validationOptions.maxDurationSeconds!) {
        errors.push(`Duration ${Math.round(duration)}s exceeds maximum allowed ${validationOptions.maxDurationSeconds}s`);
      }

      // Security scan on buffer
      if (validationOptions.scanForMalware) {
        const malwareCheck = await this.scanBufferForMalware(buffer);
        if (!malwareCheck.safe) {
          errors.push(...malwareCheck.threats);
        }
      }

      return {
        valid: errors.length === 0,
        fileType: fileExt,
        mimeType,
        duration: Math.round(duration),
        bitrate: Math.round(format.bitrate || 0),
        sampleRate: format.sampleRate || 0,
        channels: format.numberOfChannels || 0,
        size: fileSize,
        hash: this.calculateBufferHash(buffer),
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      logger.error('Buffer validation failed', error as Error);
      return {
        valid: false,
        size: buffer.length,
        errors: [`Validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Scan file for malware patterns
   */
  private async scanForMalware(filePath: string): Promise<{ safe: boolean; threats: string[] }> {
    const threats: string[] = [];

    try {
      // Read file in chunks to avoid memory issues
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

      for await (const chunk of stream) {
        const content = chunk.toString('utf8', 0, Math.min(1000, chunk.length)); // Check first 1000 bytes of each chunk

        // Check for malicious patterns
        for (const { pattern, description } of this.MALICIOUS_PATTERNS) {
          if (pattern.test(content)) {
            threats.push(description);
          }
        }

        // Check for suspicious byte sequences
        if (this.containsSuspiciousBytes(chunk)) {
          threats.push('Suspicious byte sequence detected');
        }
      }

      // Check file headers
      const headerCheck = await this.checkFileHeaders(filePath);
      if (!headerCheck.valid) {
        threats.push(headerCheck.reason);
      }

      return {
        safe: threats.length === 0,
        threats
      };
    } catch (error) {
      logger.error('Malware scan failed', error as Error);
      return {
        safe: false,
        threats: ['Failed to complete malware scan']
      };
    }
  }

  /**
   * Scan buffer for malware patterns
   */
  private async scanBufferForMalware(buffer: Buffer): Promise<{ safe: boolean; threats: string[] }> {
    const threats: string[] = [];

    try {
      // Convert part of buffer to string for pattern matching
      const content = buffer.toString('utf8', 0, Math.min(10000, buffer.length));

      for (const { pattern, description } of this.MALICIOUS_PATTERNS) {
        if (pattern.test(content)) {
          threats.push(description);
        }
      }

      // Check for suspicious bytes
      if (this.containsSuspiciousBytes(buffer)) {
        threats.push('Suspicious byte sequence detected');
      }

      return {
        safe: threats.length === 0,
        threats
      };
    } catch (error) {
      return {
        safe: false,
        threats: ['Buffer scan error']
      };
    }
  }

  /**
   * Check audio integrity
   */
  private async checkAudioIntegrity(
    filePath: string,
    metadata: mmm.IAudioMetadata
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check if duration matches file size expectations
      const expectedSize = this.estimateFileSize(metadata);
      const stats = await this.getFileStats(filePath);
      const actualSize = stats.size;

      const sizeDifference = Math.abs(actualSize - expectedSize) / expectedSize;
      if (sizeDifference > 0.5) { // 50% difference
        issues.push('File size doesn\'t match expected size for audio properties');
      }

      // Check for truncated files
      if (metadata.format.tagTypes && metadata.format.tagTypes.length === 0) {
        issues.push('No metadata tags found - file may be truncated');
      }

      // Check for codec issues
      if (!metadata.format.codec) {
        issues.push('Unable to determine audio codec');
      }

      return {
        valid: issues.length === 0,
        issues
      };
    } catch (error) {
      return {
        valid: false,
        issues: ['Unable to verify audio integrity']
      };
    }
  }

  /**
   * Check file headers for consistency
   */
  private async checkFileHeaders(filePath: string): Promise<{ valid: boolean; reason: string }> {
    try {
      const buffer = Buffer.alloc(512);
      const stream = createReadStream(filePath, { start: 0, end: 511 });

      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          chunk.copy(buffer);
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Check for file type mismatches
      const detectedType = await fileType.fromBuffer(buffer);
      if (detectedType) {
        // Check if it's actually an image or executable
        if (['jpg', 'png', 'gif', 'exe', 'dll'].includes(detectedType.ext)) {
          return {
            valid: false,
            reason: `File appears to be ${detectedType.ext} disguised as audio`
          };
        }
      }

      return { valid: true, reason: '' };
    } catch (error) {
      return { valid: true, reason: '' }; // Don't fail on header check errors
    }
  }

  /**
   * Calculate file hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Calculate buffer hash
   */
  private calculateBufferHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check for suspicious byte sequences
   */
  private containsSuspiciousBytes(buffer: Buffer): boolean {
    // Check for null byte injection
    let nullCount = 0;
    for (let i = 0; i < Math.min(1000, buffer.length); i++) {
      if (buffer[i] === 0x00) nullCount++;
    }

    // Too many null bytes might indicate padding or malicious content
    if (nullCount > 100) return true;

    // Check for executable signatures
    const exeSignature = Buffer.from([0x4D, 0x5A]); // MZ
    const elfSignature = Buffer.from([0x7F, 0x45, 0x4C, 0x46]); // ELF

    if (buffer.slice(0, 2).equals(exeSignature)) return true;
    if (buffer.slice(0, 4).equals(elfSignature)) return true;

    return false;
  }

  /**
   * Estimate expected file size based on audio properties
   */
  private estimateFileSize(metadata: mmm.IAudioMetadata): number {
    const duration = metadata.format.duration || 0;
    const bitrate = metadata.format.bitrate || 128000;

    // Calculate expected size: (bitrate * duration) / 8
    return (bitrate * duration) / 8;
  }

  /**
   * Get file stats
   */
  private async getFileStats(filePath: string): Promise<{ size: number }> {
    const fs = await import('fs');
    const stat = promisify(fs.stat);
    const stats = await stat(filePath);
    return { size: stats.size };
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}
