// Virus scanning service with ClamAV integration

import { Service } from 'typedi';
import * as NodeClam from 'clamscan';
import { logger } from '@shared/logger';
import { ConfigService } from '@shared/services/config.service';
import { EventEmitter } from '@shared/events/event-emitter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export interface ScanResult {
  clean: boolean;
  infected: boolean;
  malware?: string;
  scannedAt: Date;
  scanDuration: number;
  fileHash: string;
  quarantined?: boolean;
  error?: string;
}

export interface ScannerConfig {
  clamdscan: {
    socket?: string;
    host?: string;
    port?: number;
    timeout?: number;
  };
  clamscan: {
    path?: string;
    scanArchives?: boolean;
    scanLog?: string;
  };
  preference: 'clamdscan' | 'clamscan';
  removeInfected: boolean;
  quarantineInfected: boolean;
  quarantinePath?: string;
  debugMode: boolean;
}

@Service()
export class VirusScannerService {
  private scanner: any;
  private initialized = false;
  private readonly scanCache = new Map<string, ScanResult>();
  private readonly CACHE_TTL = 3600000; // 1 hour
  private readonly QUARANTINE_DIR: string;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter
  ) {
    this.QUARANTINE_DIR = this.configService.get('VIRUS_QUARANTINE_DIR') ||
      path.join(process.cwd(), 'quarantine');
  }

  /**
   * Initialize the virus scanner
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const config = this.getConfig();

      // Initialize ClamAV
      this.scanner = await new NodeClam().init(config);

      // Test scanner
      const version = await this.scanner.getVersion();
      logger.info('Virus scanner initialized', { version });

      this.initialized = true;

      // Create quarantine directory
      await this.ensureQuarantineDirectory();

      // Start cache cleanup interval
      this.startCacheCleanup();
    } catch (error) {
      logger.error('Failed to initialize virus scanner', error as Error);
      // Don't throw - allow system to work without virus scanning
      this.initialized = false;
    }
  }

  /**
   * Scan a file for viruses
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const fileHash = await this.calculateFileHash(filePath);
      const cached = this.getCachedResult(fileHash);
      if (cached) {
        logger.debug('Returning cached scan result', { filePath, hash: fileHash });
        return cached;
      }

      // Ensure scanner is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // If scanner still not available, return a warning
      if (!this.initialized || !this.scanner) {
        logger.warn('Virus scanner not available, skipping scan', { filePath });
        return {
          clean: true,
          infected: false,
          scannedAt: new Date(),
          scanDuration: Date.now() - startTime,
          fileHash,
          error: 'Scanner not available'
        };
      }

      // Perform scan
      logger.info('Scanning file for viruses', { filePath });
      const { isInfected, file, viruses } = await this.scanner.scanFile(filePath);

      const result: ScanResult = {
        clean: !isInfected,
        infected: isInfected,
        malware: viruses ? viruses.join(', ') : undefined,
        scannedAt: new Date(),
        scanDuration: Date.now() - startTime,
        fileHash
      };

      // Handle infected file
      if (isInfected) {
        logger.warn('Infected file detected', {
          filePath,
          malware: result.malware
        });

        // Emit security event
        this.eventEmitter.emit('security:virus-detected', {
          filePath,
          malware: result.malware,
          hash: fileHash
        });

        // Quarantine or remove
        if (this.configService.get('VIRUS_QUARANTINE_INFECTED') === 'true') {
          result.quarantined = await this.quarantineFile(filePath, fileHash);
        } else if (this.configService.get('VIRUS_REMOVE_INFECTED') === 'true') {
          await this.removeFile(filePath);
        }
      }

      // Cache result
      this.cacheResult(fileHash, result);

      // Log scan completion
      logger.info('File scan completed', {
        filePath,
        clean: result.clean,
        duration: result.scanDuration
      });

      return result;
    } catch (error) {
      logger.error('File scan failed', error as Error);

      return {
        clean: false,
        infected: false,
        scannedAt: new Date(),
        scanDuration: Date.now() - startTime,
        fileHash: '',
        error: (error as Error).message
      };
    }
  }

  /**
   * Scan a buffer for viruses
   */
  async scanBuffer(buffer: Buffer, filename?: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Calculate hash
      const fileHash = this.calculateBufferHash(buffer);

      // Check cache
      const cached = this.getCachedResult(fileHash);
      if (cached) {
        return cached;
      }

      // Write to temp file for scanning
      const tempPath = path.join(
        process.cwd(),
        'temp',
        `scan_${Date.now()}_${filename || 'buffer'}`
      );

      await fs.writeFile(tempPath, buffer);

      try {
        // Scan temp file
        const result = await this.scanFile(tempPath);

        // Update hash since scanFile calculates from file
        result.fileHash = fileHash;

        return result;
      } finally {
        // Clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch (error) {
          logger.error('Failed to delete temp scan file', error as Error);
        }
      }
    } catch (error) {
      logger.error('Buffer scan failed', error as Error);

      return {
        clean: false,
        infected: false,
        scannedAt: new Date(),
        scanDuration: Date.now() - startTime,
        fileHash: this.calculateBufferHash(buffer),
        error: (error as Error).message
      };
    }
  }

  /**
   * Scan multiple files
   */
  async scanFiles(filePaths: string[]): Promise<Map<string, ScanResult>> {
    const results = new Map<string, ScanResult>();

    // Scan in parallel with concurrency limit
    const CONCURRENCY = 5;
    for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
      const batch = filePaths.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(filePath => this.scanFile(filePath))
      );

      batch.forEach((filePath, index) => {
        results.set(filePath, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Quarantine an infected file
   */
  private async quarantineFile(filePath: string, fileHash: string): Promise<boolean> {
    try {
      const quarantinePath = path.join(
        this.QUARANTINE_DIR,
        `${fileHash}_${path.basename(filePath)}`
      );

      // Move file to quarantine
      await fs.rename(filePath, quarantinePath);

      // Create metadata file
      const metadata = {
        originalPath: filePath,
        quarantinedAt: new Date(),
        fileHash,
        reason: 'virus_detected'
      };

      await fs.writeFile(
        `${quarantinePath}.json`,
        JSON.stringify(metadata, null, 2)
      );

      logger.info('File quarantined', {
        originalPath: filePath,
        quarantinePath
      });

      return true;
    } catch (error) {
      logger.error('Failed to quarantine file', error as Error);
      return false;
    }
  }

  /**
   * Remove infected file
   */
  private async removeFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.info('Infected file removed', { filePath });
    } catch (error) {
      logger.error('Failed to remove infected file', error as Error);
      throw error;
    }
  }

  /**
   * Get scanner configuration
   */
  private getConfig(): ScannerConfig {
    return {
      clamdscan: {
        socket: this.configService.get('CLAMAV_SOCKET') || '/var/run/clamav/clamd.ctl',
        host: this.configService.get('CLAMAV_HOST') || 'localhost',
        port: parseInt(this.configService.get('CLAMAV_PORT') || '3310'),
        timeout: 60000
      },
      clamscan: {
        path: this.configService.get('CLAMSCAN_PATH') || '/usr/bin/clamscan',
        scanArchives: true,
        scanLog: path.join(process.cwd(), 'logs', 'clamscan.log')
      },
      preference: (this.configService.get('CLAMAV_PREFERENCE') || 'clamdscan') as any,
      removeInfected: false, // We handle this ourselves
      quarantineInfected: false, // We handle this ourselves
      debugMode: this.configService.get('NODE_ENV') === 'development'
    };
  }

  /**
   * Calculate file hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = await fs.readFile(filePath);
    hash.update(stream);
    return hash.digest('hex');
  }

  /**
   * Calculate buffer hash
   */
  private calculateBufferHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Get cached scan result
   */
  private getCachedResult(fileHash: string): ScanResult | null {
    const cached = this.scanCache.get(fileHash);
    if (!cached) return null;

    // Check if cache is still valid
    const age = Date.now() - cached.scannedAt.getTime();
    if (age > this.CACHE_TTL) {
      this.scanCache.delete(fileHash);
      return null;
    }

    return cached;
  }

  /**
   * Cache scan result
   */
  private cacheResult(fileHash: string, result: ScanResult): void {
    this.scanCache.set(fileHash, result);
  }

  /**
   * Ensure quarantine directory exists
   */
  private async ensureQuarantineDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.QUARANTINE_DIR, { recursive: true });
    } catch (error) {
      logger.error('Failed to create quarantine directory', error as Error);
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];

      this.scanCache.forEach((result, hash) => {
        const age = now - result.scannedAt.getTime();
        if (age > this.CACHE_TTL) {
          expired.push(hash);
        }
      });

      expired.forEach(hash => this.scanCache.delete(hash));

      if (expired.length > 0) {
        logger.debug('Cleaned expired scan cache entries', { count: expired.length });
      }
    }, 3600000); // Clean every hour
  }

  /**
   * Get scanner status
   */
  async getStatus(): Promise<{
    available: boolean;
    version?: string;
    definitions?: {
      version: string;
      updated: Date;
    };
    stats?: {
      cachedScans: number;
      quarantinedFiles: number;
    };
  }> {
    try {
      if (!this.initialized || !this.scanner) {
        return { available: false };
      }

      const version = await this.scanner.getVersion();

      // Get quarantine stats
      let quarantinedFiles = 0;
      try {
        const files = await fs.readdir(this.QUARANTINE_DIR);
        quarantinedFiles = files.filter(f => !f.endsWith('.json')).length;
      } catch (error) {
        // Ignore if quarantine dir doesn't exist
      }

      return {
        available: true,
        version,
        stats: {
          cachedScans: this.scanCache.size,
          quarantinedFiles
        }
      };
    } catch (error) {
      return { available: false };
    }
  }
}
