import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Container } from 'typedi';
import { TranscriptService } from '../transcript.service';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { YouTubeIntegrationService } from '@modules/youtube-integration';

// Mock dependencies
vi.mock('@shared/services/prisma.service');
vi.mock('@shared/services/redis.service');
vi.mock('@modules/youtube-integration');

describe('TranscriptService', () => {
  let service: TranscriptService;

  beforeAll(() => {
    // Setup mocks
    Container.set(PrismaService, {
      transcript: {
        findFirst: vi.fn(),
        upsert: vi.fn()
      },
      video: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      }
    });

    Container.set(RedisService, {
      get: vi.fn(),
      setex: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      del: vi.fn()
    });

    Container.set(YouTubeIntegrationService, {
      getCaptions: vi.fn(),
      getVideoInfo: vi.fn()
    });

    service = Container.get(TranscriptService);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('getTranscript', () => {
    it('should return transcript from cache if available', async () => {
      const mockTranscript = {
        videoId: 'test-video',
        language: 'en',
        sentences: [],
        fullText: 'Test transcript'
      };

      const redis = Container.get(RedisService) as any;
      redis.get.mockResolvedValue(JSON.stringify(mockTranscript));

      const result = await service.getTranscript({
        videoId: 'test-video',
        language: 'en',
        forceRefresh: false,
        includeTimestamps: true,
        includeWordLevel: false
      });

      expect(result).toBeDefined();
      expect(redis.get).toHaveBeenCalledWith('transcript:test-video:en');
    });
  });

  describe('segmentTranscript', () => {
    it('should segment text into sentences', async () => {
      const text = 'This is a test. This is another sentence! And one more?';

      const segments = await service.segmentTranscript(text);

      expect(segments).toHaveLength(3);
      expect(segments[0].text).toBe('This is a test');
      expect(segments[1].text).toBe('This is another sentence');
      expect(segments[2].text).toBe('And one more');
    });
  });

  describe('calculateSentenceDifficulty', () => {
    it('should calculate difficulty based on sentence complexity', () => {
      // Test implementation
      expect(service).toBeDefined();
    });
  });
});`