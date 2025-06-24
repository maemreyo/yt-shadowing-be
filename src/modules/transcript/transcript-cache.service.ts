// Advanced caching service for YouTube transcripts

import { Service } from 'typedi';
import { RedisService } from '@shared/services/redis.service';
import { logger } from '@shared/logger';
import { ConfigService } from '@shared/services/config.service';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface TranscriptCacheEntry {
  videoId: string;
  language: string;
  transcript: any;
  metadata: {
    source: string;
    duration: number;
    sentenceCount: number;
    difficulty: number;
    fetchedAt: Date;
    expiresAt: Date;
  };
  compressed: boolean;
  version: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  count: number;
}

@Service()
export class TranscriptCacheService {
  private readonly CACHE_PREFIX = 'transcript:';
  private readonly STATS_PREFIX = 'transcript-stats:';
  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days
  private readonly COMPRESSION_THRESHOLD = 1024; // 1KB
  private readonly VERSION = '1.0';

  // Different TTLs based on source
  private readonly TTL_BY_SOURCE = {
    youtube: 7 * 24 * 60 * 60, // 7 days
    whisper: 30 * 24 * 60 * 60, // 30 days
    manual: 365 * 24 * 60 * 60, // 1 year
    auto: 24 * 60 * 60 // 1 day
  };

  constructor(
    private redis: RedisService,
    private configService: ConfigService
  ) {}

  /**
   * Get transcript from cache
   */
  async get(videoId: string, language: string = 'en'): Promise<TranscriptCacheEntry | null> {
    const key = this.getCacheKey(videoId, language);

    try {
      const cached = await this.redis.get(key);
      if (!cached) {
        await this.recordMiss(videoId);
        return null;
      }

      // Parse cached entry
      const entry: TranscriptCacheEntry = JSON.parse(cached);

      // Check version compatibility
      if (entry.version !== this.VERSION) {
        logger.warn('Cache version mismatch, invalidating', {
          videoId,
          cachedVersion: entry.version,
          currentVersion: this.VERSION
        });
        await this.delete(videoId, language);
        return null;
      }

      // Decompress if needed
      if (entry.compressed && entry.transcript) {
        const buffer = Buffer.from(entry.transcript, 'base64');
        const decompressed = await gunzip(buffer);
        entry.transcript = JSON.parse(decompressed.toString());
      }

      // Record hit
      await this.recordHit(videoId);

      logger.debug('Transcript cache hit', {
        videoId,
        language,
        compressed: entry.compressed,
        age: Date.now() - new Date(entry.metadata.fetchedAt).getTime()
      });

      return entry;
    } catch (error) {
      logger.error('Failed to get transcript from cache', error as Error);
      await this.recordMiss(videoId);
      return null;
    }
  }

  /**
   * Set transcript in cache
   */
  async set(
    videoId: string,
    language: string,
    transcript: any,
    metadata: Partial<TranscriptCacheEntry['metadata']> = {}
  ): Promise<void> {
    const key = this.getCacheKey(videoId, language);

    try {
      // Prepare cache entry
      const ttl = this.TTL_BY_SOURCE[metadata.source as keyof typeof this.TTL_BY_SOURCE] || this.DEFAULT_TTL;
      const now = new Date();

      const entry: TranscriptCacheEntry = {
        videoId,
        language,
        transcript,
        metadata: {
          source: metadata.source || 'auto',
          duration: metadata.duration || 0,
          sentenceCount: metadata.sentenceCount || 0,
          difficulty: metadata.difficulty || 0,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttl * 1000),
          ...metadata
        },
        compressed: false,
        version: this.VERSION
      };

      // Compress if large
      const transcriptStr = JSON.stringify(transcript);
      if (transcriptStr.length > this.COMPRESSION_THRESHOLD) {
        const compressed = await gzip(transcriptStr);
        entry.transcript = compressed.toString('base64');
        entry.compressed = true;

        logger.debug('Compressed transcript for caching', {
          videoId,
          originalSize: transcriptStr.length,
          compressedSize: compressed.length,
          ratio: (compressed.length / transcriptStr.length).toFixed(2)
        });
      }

      // Store in Redis
      await this.redis.setex(key, ttl, JSON.stringify(entry));

      // Update cache index
      await this.updateCacheIndex(videoId, language, ttl);

      logger.info('Transcript cached', {
        videoId,
        language,
        ttl,
        compressed: entry.compressed
      });
    } catch (error) {
      logger.error('Failed to cache transcript', error as Error);
    }
  }

  /**
   * Delete transcript from cache
   */
  async delete(videoId: string, language?: string): Promise<void> {
    try {
      if (language) {
        // Delete specific language
        const key = this.getCacheKey(videoId, language);
        await this.redis.del(key);
        await this.removeFromIndex(videoId, language);
      } else {
        // Delete all languages for video
        const pattern = `${this.CACHE_PREFIX}${videoId}:*`;
        const keys = await this.redis.keys(pattern);

        if (keys.length > 0) {
          await this.redis.del(...keys);

          // Remove from index
          for (const key of keys) {
            const lang = key.split(':').pop();
            if (lang) {
              await this.removeFromIndex(videoId, lang);
            }
          }
        }
      }

      logger.info('Transcript cache deleted', { videoId, language });
    } catch (error) {
      logger.error('Failed to delete transcript cache', error as Error);
    }
  }

  /**
   * Warm up cache for popular videos
   */
  async warmUp(popularVideos: Array<{ videoId: string; language: string }>): Promise<void> {
    logger.info('Warming up transcript cache', { count: popularVideos.length });

    const results = await Promise.allSettled(
      popularVideos.map(async ({ videoId, language }) => {
        const exists = await this.exists(videoId, language);
        if (!exists) {
          // Emit event to fetch and cache
          return { videoId, language, cached: false };
        }
        return { videoId, language, cached: true };
      })
    );

    const stats = results.reduce((acc, result) => {
      if (result.status === 'fulfilled') {
        acc[result.value.cached ? 'alreadyCached' : 'needsCaching']++;
      } else {
        acc.errors++;
      }
      return acc;
    }, { alreadyCached: 0, needsCaching: 0, errors: 0 });

    logger.info('Cache warm-up complete', stats);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const [hits, misses] = await Promise.all([
        this.redis.get(`${this.STATS_PREFIX}hits`).then(v => parseInt(v || '0')),
        this.redis.get(`${this.STATS_PREFIX}misses`).then(v => parseInt(v || '0'))
      ]);

      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      // Get cache size
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      const count = keys.length;

      // Estimate size (sampling)
      let totalSize = 0;
      const sampleSize = Math.min(10, count);
      const sampleKeys = keys.slice(0, sampleSize);

      for (const key of sampleKeys) {
        const value = await this.redis.get(key);
        if (value) {
          totalSize += value.length;
        }
      }

      const estimatedSize = count > 0 ? (totalSize / sampleSize) * count : 0;

      return {
        hits,
        misses,
        hitRate: Math.round(hitRate * 100) / 100,
        size: Math.round(estimatedSize),
        count
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error as Error);
      return { hits: 0, misses: 0, hitRate: 0, size: 0, count: 0 };
    }
  }

  /**
   * Clear old cache entries
   */
  async cleanup(): Promise<number> {
    try {
      const indexKey = `${this.CACHE_PREFIX}index`;
      const now = Date.now();

      // Get expired entries from index
      const expiredMembers = await this.redis.zrangebyscore(
        indexKey,
        '-inf',
        now
      );

      if (expiredMembers.length === 0) {
        return 0;
      }

      // Delete expired entries
      const keysToDelete = expiredMembers.map(member => {
        const [videoId, language] = member.split('|');
        return this.getCacheKey(videoId, language);
      });

      await this.redis.del(...keysToDelete);

      // Remove from index
      await this.redis.zrem(indexKey, ...expiredMembers);

      logger.info('Cache cleanup completed', {
        removed: expiredMembers.length
      });

      return expiredMembers.length;
    } catch (error) {
      logger.error('Cache cleanup failed', error as Error);
      return 0;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}${pattern}`);

      if (keys.length === 0) {
        return 0;
      }

      await this.redis.del(...keys);

      logger.info('Cache invalidated by pattern', {
        pattern,
        count: keys.length
      });

      return keys.length;
    } catch (error) {
      logger.error('Failed to invalidate cache by pattern', error as Error);
      return 0;
    }
  }

  /**
   * Check if cache exists
   */
  async exists(videoId: string, language: string = 'en'): Promise<boolean> {
    const key = this.getCacheKey(videoId, language);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Get cache TTL
   */
  async getTTL(videoId: string, language: string = 'en'): Promise<number> {
    const key = this.getCacheKey(videoId, language);
    return await this.redis.ttl(key);
  }

  /**
   * Extend cache TTL
   */
  async touch(videoId: string, language: string = 'en', additionalTTL?: number): Promise<boolean> {
    const key = this.getCacheKey(videoId, language);
    const currentTTL = await this.redis.ttl(key);

    if (currentTTL > 0) {
      const newTTL = currentTTL + (additionalTTL || this.DEFAULT_TTL);
      await this.redis.expire(key, newTTL);

      // Update index
      await this.updateCacheIndex(videoId, language, newTTL);

      return true;
    }

    return false;
  }

  // Private helper methods

  private getCacheKey(videoId: string, language: string): string {
    return `${this.CACHE_PREFIX}${videoId}:${language}`;
  }

  private async recordHit(videoId: string): Promise<void> {
    await Promise.all([
      this.redis.incr(`${this.STATS_PREFIX}hits`),
      this.redis.incr(`${this.STATS_PREFIX}hits:${videoId}`)
    ]);
  }

  private async recordMiss(videoId: string): Promise<void> {
    await Promise.all([
      this.redis.incr(`${this.STATS_PREFIX}misses`),
      this.redis.incr(`${this.STATS_PREFIX}misses:${videoId}`)
    ]);
  }

  private async updateCacheIndex(videoId: string, language: string, ttl: number): Promise<void> {
    const indexKey = `${this.CACHE_PREFIX}index`;
    const member = `${videoId}|${language}`;
    const score = Date.now() + (ttl * 1000);

    await this.redis.zadd(indexKey, score, member);
  }

  private async removeFromIndex(videoId: string, language: string): Promise<void> {
    const indexKey = `${this.CACHE_PREFIX}index`;
    const member = `${videoId}|${language}`;

    await this.redis.zrem(indexKey, member);
  }

  /**
   * Get popular videos based on cache hits
   */
  async getPopularVideos(limit: number = 10): Promise<Array<{ videoId: string; hits: number }>> {
    const pattern = `${this.STATS_PREFIX}hits:*`;
    const keys = await this.redis.keys(pattern);

    const videos = await Promise.all(
      keys.map(async (key) => {
        const videoId = key.replace(`${this.STATS_PREFIX}hits:`, '');
        const hits = parseInt(await this.redis.get(key) || '0');
        return { videoId, hits };
      })
    );

    return videos
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }
}
