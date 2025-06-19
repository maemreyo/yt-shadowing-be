import { Service } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { QueueService } from '@shared/services/queue.service';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { AppError } from '@shared/errors';
import { logger } from '@shared/logger';
import {
  UploadRecordingDTO,
  ProcessAudioDTO,
  CompareAudioDTO,
  WaveformRequestDTO,
  AudioAnalysisResultDTO,
  RecordingMetadataDTO,
  ExportRecordingDTO,
  AudioQualitySettingsDTO,
  RecordingLimitsDTO
} from './audio-processing.dto';
import { EventEmitter } from '@shared/events';
import { AudioProcessingEvents } from './audio-processing.events';
import { OpenAI } from 'openai';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

@Service()
export class AudioProcessingService {
  private s3Client: S3Client;
  private openai: OpenAI | null = null;
  private readonly CACHE_PREFIX = 'audio:';
  private readonly TEMP_DIR = path.join(os.tmpdir(), 'audio-processing');

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private queueService: QueueService,
    private eventEmitter: EventEmitter
  ) {
    // Initialize S3 client for Cloudflare R2
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!
      }
    });

    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_WHISPER_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_WHISPER_API_KEY
      });
    }

    // Ensure temp directory exists
    this.ensureTempDirectory();
  }

  /**
   * Upload and process a recording
   */
  async uploadRecording(userId: string, data: UploadRecordingDTO): Promise<RecordingMetadataDTO> {
    try {
      // Check user limits
      await this.checkRecordingLimits(userId);

      // Validate session ownership
      const session = await this.prisma.practiceSession.findFirst({
        where: {
          id: data.sessionId,
          userId
        }
      });

      if (!session) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      // Decode base64 audio data
      const audioBuffer = Buffer.from(data.audioData, 'base64');

      // Validate file size
      const fileSizeMB = audioBuffer.length / (1024 * 1024);
      const maxSizeMB = parseInt(process.env.RECORDING_MAX_SIZE_MB || '50');

      if (fileSizeMB > maxSizeMB) {
        throw new AppError(
          `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
          400,
          'FILE_TOO_LARGE'
        );
      }

      // Generate unique filename
      const filename = this.generateFilename(userId, data.sentenceIndex, data.mimeType);

      // Create recording record in database
      const recording = await this.prisma.recording.create({
        data: {
          userId,
          sessionId: data.sessionId,
          sentenceIndex: data.sentenceIndex,
          sentenceStartTime: data.sentenceStartTime,
          sentenceEndTime: data.sentenceEndTime,
          format: data.mimeType,
          status: 'uploading',
          fileSize: audioBuffer.length,
          metadata: data.metadata || {}
        }
      });

      // Upload to Cloudflare R2
      const audioUrl = await this.uploadToCloudflare(audioBuffer, filename, data.mimeType);

      // Update recording with URL
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: {
          audioUrl,
          status: 'processing'
        }
      });

      // Queue background processing
      await this.queueService.add('audio-processing', {
        recordingId: recording.id,
        userId,
        operations: ['convert', 'waveform', 'transcribe']
      });

      // Emit upload event
      this.eventEmitter.emit(AudioProcessingEvents.RECORDING_UPLOADED, {
        recordingId: recording.id,
        userId,
        sessionId: data.sessionId,
        sentenceIndex: data.sentenceIndex
      });

      return this.formatRecordingMetadata(recording);
    } catch (error) {
      logger.error('Failed to upload recording', error as Error);
      throw error;
    }
  }

  /**
   * Process audio with specified operations
   */
  async processAudio(data: ProcessAudioDTO): Promise<void> {
    try {
      const recording = await this.prisma.recording.findUnique({
        where: { id: data.recordingId }
      });

      if (!recording) {
        throw new AppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
      }

      // Download audio from storage
      const audioBuffer = await this.downloadFromCloudflare(recording.audioUrl);
      const tempInputPath = path.join(this.TEMP_DIR, `${recording.id}_input${path.extname(recording.audioUrl)}`);
      await fs.writeFile(tempInputPath, audioBuffer);

      const updates: any = {};

      try {
        // Execute requested operations
        for (const operation of data.operations) {
          switch (operation) {
            case 'convert':
              if (data.targetFormat && data.targetFormat !== recording.format) {
                const convertedPath = await this.convertAudioFormat(
                  tempInputPath,
                  recording.format,
                  data.targetFormat
                );
                // Upload converted file
                const convertedBuffer = await fs.readFile(convertedPath);
                const newFilename = this.generateFilename(
                  recording.userId,
                  recording.sentenceIndex,
                  `audio/${data.targetFormat}`
                );
                const newUrl = await this.uploadToCloudflare(
                  convertedBuffer,
                  newFilename,
                  `audio/${data.targetFormat}`
                );
                updates.audioUrl = newUrl;
                updates.format = `audio/${data.targetFormat}`;
                await fs.unlink(convertedPath);
              }
              break;

            case 'waveform':
              const waveform = await this.generateWaveform(tempInputPath);
              updates.waveformData = waveform;
              break;

            case 'transcribe':
              if (this.openai) {
                const transcription = await this.transcribeAudio(
                  tempInputPath,
                  data.transcriptionLanguage
                );
                updates.transcription = transcription.text;
                updates.transcriptionConfidence = transcription.confidence;
              }
              break;

            case 'analyze':
              // This would be implemented with audio analysis
              break;

            case 'normalize':
              const normalizedPath = await this.normalizeAudio(tempInputPath);
              const normalizedBuffer = await fs.readFile(normalizedPath);
              const normalizedFilename = this.generateFilename(
                recording.userId,
                recording.sentenceIndex,
                recording.format
              );
              const normalizedUrl = await this.uploadToCloudflare(
                normalizedBuffer,
                normalizedFilename,
                recording.format
              );
              updates.audioUrl = normalizedUrl;
              await fs.unlink(normalizedPath);
              break;

            case 'denoise':
              // Would require more sophisticated audio processing
              break;
          }
        }

        // Update recording with processed data
        await this.prisma.recording.update({
          where: { id: data.recordingId },
          data: {
            ...updates,
            status: 'completed',
            processedAt: new Date()
          }
        });

        // Clear cache
        await this.clearRecordingCache(data.recordingId);

        this.eventEmitter.emit(AudioProcessingEvents.PROCESSING_COMPLETED, {
          recordingId: data.recordingId,
          operations: data.operations
        });

      } finally {
        // Cleanup temp file
        await fs.unlink(tempInputPath).catch(() => {});
      }
    } catch (error) {
      logger.error('Failed to process audio', error as Error);

      // Update status to failed
      await this.prisma.recording.update({
        where: { id: data.recordingId },
        data: {
          status: 'failed',
          error: (error as Error).message
        }
      });

      this.eventEmitter.emit(AudioProcessingEvents.PROCESSING_FAILED, {
        recordingId: data.recordingId,
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Compare user recording with reference
   */
  async compareAudio(userId: string, data: CompareAudioDTO): Promise<AudioAnalysisResultDTO> {
    try {
      const recording = await this.prisma.recording.findFirst({
        where: {
          id: data.userRecordingId,
          userId
        }
      });

      if (!recording) {
        throw new AppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
      }

      // Initialize analysis result
      const result: AudioAnalysisResultDTO = {
        recordingId: recording.id,
        overallScore: 0,
        scores: {
          pronunciation: 0,
          fluency: 0,
          timing: 0,
          clarity: 0
        },
        issues: [],
        recommendations: [],
        processedAt: new Date()
      };

      // Get transcription if available
      if (recording.transcription) {
        result.transcription = {
          text: recording.transcription,
          confidence: recording.transcriptionConfidence || 0
        };

        // Compare transcription with original text
        const comparisonResult = this.compareTranscriptions(
          recording.transcription,
          data.originalText
        );

        result.scores.pronunciation = comparisonResult.accuracy;
        result.issues.push(...comparisonResult.issues);
      }

      // Analyze timing if we have sentence timestamps
      if (recording.duration) {
        const expectedDuration = recording.sentenceEndTime - recording.sentenceStartTime;
        const timingScore = this.calculateTimingScore(recording.duration, expectedDuration);
        result.scores.timing = timingScore;

        if (timingScore < 70) {
          result.issues.push({
            type: 'timing',
            severity: timingScore < 50 ? 'high' : 'medium',
            issue: recording.duration > expectedDuration ? 'Speaking too slowly' : 'Speaking too quickly',
            suggestion: 'Try to match the natural pace of the original speaker'
          });
        }
      }

      // Calculate fluency based on pauses and consistency
      result.scores.fluency = await this.calculateFluencyScore(recording);

      // Overall clarity score (simplified)
      result.scores.clarity = Math.round(
        (result.scores.pronunciation + result.scores.fluency) / 2
      );

      // Calculate overall score
      result.overallScore = Math.round(
        (result.scores.pronunciation * 0.4 +
         result.scores.fluency * 0.3 +
         result.scores.timing * 0.2 +
         result.scores.clarity * 0.1)
      );

      // Generate recommendations
      result.recommendations = this.generateRecommendations(result.scores, result.issues);

      // Save analysis result
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: {
          qualityScore: result.overallScore,
          analysisResult: result as any
        }
      });

      // Cache result
      await this.cacheAnalysisResult(recording.id, result);

      // Emit analysis event
      this.eventEmitter.emit(AudioProcessingEvents.ANALYSIS_COMPLETED, {
        recordingId: recording.id,
        userId,
        score: result.overallScore
      });

      return result;
    } catch (error) {
      logger.error('Failed to compare audio', error as Error);
      throw error;
    }
  }

  /**
   * Generate waveform data
   */
  async generateWaveformData(data: WaveformRequestDTO): Promise<number[] | string> {
    try {
      let audioBuffer: Buffer;
      let recordingId: string | undefined;

      if (data.recordingId) {
        const recording = await this.prisma.recording.findUnique({
          where: { id: data.recordingId }
        });

        if (!recording) {
          throw new AppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
        }

        // Check cache
        const cached = await this.getCachedWaveform(recording.id);
        if (cached) {
          return data.format === 'json' ? cached : this.waveformToSvg(cached, data);
        }

        audioBuffer = await this.downloadFromCloudflare(recording.audioUrl);
        recordingId = recording.id;
      } else if (data.audioUrl) {
        // Download from URL
        const response = await fetch(data.audioUrl);
        audioBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new AppError('No audio source provided', 400, 'NO_AUDIO_SOURCE');
      }

      // Save to temp file
      const tempPath = path.join(this.TEMP_DIR, `waveform_${Date.now()}.tmp`);
      await fs.writeFile(tempPath, audioBuffer);

      try {
        const waveform = await this.generateWaveform(tempPath, data.resolution);

        // Cache if it's from a recording
        if (recordingId) {
          await this.cacheWaveform(recordingId, waveform);
        }

        // Return in requested format
        switch (data.format) {
          case 'svg':
            return this.waveformToSvg(waveform, data);
          case 'png':
            // Would require canvas library
            throw new AppError('PNG format not yet implemented', 501);
          default:
            return waveform;
        }
      } finally {
        await fs.unlink(tempPath).catch(() => {});
      }
    } catch (error) {
      logger.error('Failed to generate waveform', error as Error);
      throw error;
    }
  }

  /**
   * Get recording metadata
   */
  async getRecording(recordingId: string, userId: string): Promise<RecordingMetadataDTO> {
    const recording = await this.prisma.recording.findFirst({
      where: {
        id: recordingId,
        userId
      }
    });

    if (!recording) {
      throw new AppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }

    // Generate presigned URL for download
    const presignedUrl = await this.generatePresignedUrl(recording.audioUrl);

    return {
      ...this.formatRecordingMetadata(recording),
      audioUrl: presignedUrl
    };
  }

  /**
   * Delete recording
   */
  async deleteRecording(recordingId: string, userId: string): Promise<void> {
    try {
      const recording = await this.prisma.recording.findFirst({
        where: {
          id: recordingId,
          userId
        }
      });

      if (!recording) {
        throw new AppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
      }

      // Delete from storage
      await this.deleteFromCloudflare(recording.audioUrl);

      // Delete from database
      await this.prisma.recording.delete({
        where: { id: recordingId }
      });

      // Clear cache
      await this.clearRecordingCache(recordingId);

      // Emit deletion event
      this.eventEmitter.emit(AudioProcessingEvents.RECORDING_DELETED, {
        recordingId,
        userId
      });
    } catch (error) {
      logger.error('Failed to delete recording', error as Error);
      throw error;
    }
  }

  /**
   * Get user's recording limits
   */
  async getRecordingLimits(userId: string): Promise<RecordingLimitsDTO> {
    // Get user's subscription tier
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    const tier = user?.subscription?.plan || 'free';

    // Define limits based on tier
    const limits = {
      free: {
        maxDuration: 60, // 1 minute
        maxFileSize: 10, // 10 MB
        dailyLimit: 10,
        storageQuota: 0.5 // 500 MB
      },
      pro: {
        maxDuration: 300, // 5 minutes
        maxFileSize: 50, // 50 MB
        dailyLimit: 100,
        storageQuota: 5 // 5 GB
      },
      premium: {
        maxDuration: 600, // 10 minutes
        maxFileSize: 100, // 100 MB
        dailyLimit: -1, // unlimited
        storageQuota: 50 // 50 GB
      }
    };

    const userLimits = limits[tier as keyof typeof limits] || limits.free;

    // Get current usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [dailyCount, totalStorage] = await Promise.all([
      this.prisma.recording.count({
        where: {
          userId,
          createdAt: { gte: today }
        }
      }),
      this.prisma.recording.aggregate({
        where: { userId },
        _sum: { fileSize: true }
      })
    ]);

    const totalStorageGB = (totalStorage._sum.fileSize || 0) / (1024 * 1024 * 1024);
    const canRecord = userLimits.dailyLimit === -1 || dailyCount < userLimits.dailyLimit;

    let limitReason: 'duration' | 'size' | 'daily' | 'storage' | undefined;
    if (!canRecord) {
      limitReason = 'daily';
    } else if (totalStorageGB >= userLimits.storageQuota) {
      limitReason = 'storage';
    }

    return {
      maxDuration: userLimits.maxDuration,
      maxFileSize: userLimits.maxFileSize,
      dailyLimit: userLimits.dailyLimit,
      storageQuota: userLimits.storageQuota,
      currentUsage: {
        dailyCount,
        totalStorage: totalStorageGB
      },
      canRecord: canRecord && totalStorageGB < userLimits.storageQuota,
      limitReason
    };
  }

  /**
   * Private helper methods
   */

  private async ensureTempDirectory() {
    try {
      await fs.mkdir(this.TEMP_DIR, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', error as Error);
    }
  }

  private generateFilename(userId: string, sentenceIndex: number, mimeType: string): string {
    const ext = mimeType.split('/')[1] || 'webm';
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${userId}-${sentenceIndex}-${timestamp}`).digest('hex').substring(0, 8);
    return `recordings/${userId}/${sentenceIndex}_${timestamp}_${hash}.${ext}`;
  }

  private async uploadToCloudflare(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType
    });

    await this.s3Client.send(command);

    // Return the public URL
    return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
  }

  private async downloadFromCloudflare(url: string): Promise<Buffer> {
    // Extract key from URL
    const key = url.replace(`${process.env.CLOUDFLARE_R2_PUBLIC_URL}/`, '');

    const command = new GetObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: key
    });

    const response = await this.s3Client.send(command);
    const chunks: Uint8Array[] = [];

    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  private async deleteFromCloudflare(url: string): Promise<void> {
    const key = url.replace(`${process.env.CLOUDFLARE_R2_PUBLIC_URL}/`, '');

    const command = new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: key
    });

    await this.s3Client.send(command);
  }

  private async generatePresignedUrl(url: string): Promise<string> {
    const key = url.replace(`${process.env.CLOUDFLARE_R2_PUBLIC_URL}/`, '');

    const command = new GetObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: key
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour
  }

  private async checkRecordingLimits(userId: string): Promise<void> {
    const limits = await this.getRecordingLimits(userId);

    if (!limits.canRecord) {
      throw new AppError(
        `Recording limit exceeded: ${limits.limitReason}`,
        403,
        'RECORDING_LIMIT_EXCEEDED',
        limits
      );
    }
  }

  private async convertAudioFormat(inputPath: string, fromFormat: string, toFormat: string): Promise<string> {
    const outputPath = inputPath.replace(path.extname(inputPath), `.${toFormat.split('/')[1]}`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat(toFormat.split('/')[1])
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async normalizeAudio(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace(path.extname(inputPath), '_normalized' + path.extname(inputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11')
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async generateWaveform(audioPath: string, resolution: number = 1000): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const waveform: number[] = [];

      ffmpeg(audioPath)
        .audioFilters(`aformat=channel_layouts=mono,compand,aresample=${resolution}`)
        .format('f32le')
        .on('error', reject)
        .on('end', () => {
          // Normalize waveform data
          const maxValue = Math.max(...waveform.map(Math.abs));
          const normalized = waveform.map(v => v / maxValue);
          resolve(normalized);
        })
        .pipe()
        .on('data', (chunk: Buffer) => {
          // Convert raw PCM data to waveform points
          for (let i = 0; i < chunk.length; i += 4) {
            waveform.push(chunk.readFloatLE(i));
          }
        });
    });
  }

  private async transcribeAudio(audioPath: string, language: string): Promise<{ text: string; confidence: number }> {
    if (!this.openai) {
      throw new AppError('Speech-to-text service not configured', 501, 'SERVICE_NOT_CONFIGURED');
    }

    try {
      const audioFile = await fs.readFile(audioPath);

      const transcription = await this.openai.audio.transcriptions.create({
        file: new File([audioFile], 'audio.webm'),
        model: 'whisper-1',
        language,
        response_format: 'verbose_json'
      });

      return {
        text: transcription.text,
        confidence: 0.9 // Whisper doesn't provide confidence scores, so we use a default
      };
    } catch (error) {
      logger.error('Transcription failed', error as Error);
      throw new AppError('Failed to transcribe audio', 500, 'TRANSCRIPTION_FAILED');
    }
  }

  private compareTranscriptions(userText: string, originalText: string): {
    accuracy: number;
    issues: Array<any>;
  } {
    // Simple word-level comparison (could be enhanced with phonetic matching)
    const userWords = userText.toLowerCase().split(/\s+/);
    const originalWords = originalText.toLowerCase().split(/\s+/);

    let correctWords = 0;
    const issues: Array<any> = [];

    for (let i = 0; i < originalWords.length; i++) {
      if (i < userWords.length && userWords[i] === originalWords[i]) {
        correctWords++;
      } else if (i < userWords.length) {
        issues.push({
          type: 'pronunciation',
          severity: 'medium',
          word: originalWords[i],
          position: i,
          issue: `Pronounced "${userWords[i]}" instead of "${originalWords[i]}"`,
          suggestion: `Focus on the pronunciation of "${originalWords[i]}"`
        });
      }
    }

    const accuracy = Math.round((correctWords / originalWords.length) * 100);

    return { accuracy, issues };
  }

  private calculateTimingScore(actualDuration: number, expectedDuration: number): number {
    const difference = Math.abs(actualDuration - expectedDuration);
    const percentageDiff = (difference / expectedDuration) * 100;

    if (percentageDiff <= 10) return 100;
    if (percentageDiff <= 20) return 90;
    if (percentageDiff <= 30) return 80;
    if (percentageDiff <= 40) return 70;
    if (percentageDiff <= 50) return 60;
    return 50;
  }

  private async calculateFluencyScore(recording: any): Promise<number> {
    // Simplified fluency calculation
    // In a real implementation, this would analyze pauses, hesitations, etc.
    if (!recording.transcription) return 70;

    const words = recording.transcription.split(/\s+/).length;
    const duration = recording.duration || 1;
    const wordsPerMinute = (words / duration) * 60;

    // Ideal speaking rate is 130-160 words per minute
    if (wordsPerMinute >= 130 && wordsPerMinute <= 160) return 100;
    if (wordsPerMinute >= 110 && wordsPerMinute <= 180) return 90;
    if (wordsPerMinute >= 90 && wordsPerMinute <= 200) return 80;
    if (wordsPerMinute >= 70 && wordsPerMinute <= 220) return 70;
    return 60;
  }

  private generateRecommendations(scores: any, issues: any[]): string[] {
    const recommendations: string[] = [];

    if (scores.pronunciation < 80) {
      recommendations.push('Practice pronunciation by repeating difficult words slowly');
    }

    if (scores.fluency < 80) {
      recommendations.push('Work on speaking more naturally without long pauses');
    }

    if (scores.timing < 80) {
      recommendations.push('Try to match the pace of the original speaker');
    }

    if (issues.length > 3) {
      recommendations.push('Focus on the most challenging sentences and practice them repeatedly');
    }

    return recommendations;
  }

  private formatRecordingMetadata(recording: any): RecordingMetadataDTO {
    return {
      id: recording.id,
      userId: recording.userId,
      sessionId: recording.sessionId,
      sentenceIndex: recording.sentenceIndex,
      audioUrl: recording.audioUrl,
      format: recording.format,
      duration: recording.duration || 0,
      fileSize: recording.fileSize,
      waveformData: recording.waveformData,
      transcription: recording.transcription,
      qualityScore: recording.qualityScore,
      status: recording.status,
      error: recording.error,
      createdAt: recording.createdAt,
      processedAt: recording.processedAt
    };
  }

  private waveformToSvg(waveform: number[], options: WaveformRequestDTO): string {
    const width = 800;
    const height = 200;
    const midY = height / 2;

    const points = waveform.map((value, index) => {
      const x = (index / waveform.length) * width;
      const y = midY - (value * midY * 0.8); // 80% of half height
      return `${x},${y}`;
    }).join(' ');

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="white"/>
        <polyline points="${points}" fill="none" stroke="${options.color}" stroke-width="2"/>
      </svg>
    `;
  }

  private async cacheWaveform(recordingId: string, waveform: number[]): Promise<void> {
    const key = `${this.CACHE_PREFIX}waveform:${recordingId}`;
    await this.redis.setex(key, 3600, JSON.stringify(waveform)); // 1 hour
  }

  private async getCachedWaveform(recordingId: string): Promise<number[] | null> {
    const key = `${this.CACHE_PREFIX}waveform:${recordingId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  private async cacheAnalysisResult(recordingId: string, result: AudioAnalysisResultDTO): Promise<void> {
    const key = `${this.CACHE_PREFIX}analysis:${recordingId}`;
    await this.redis.setex(key, 3600, JSON.stringify(result)); // 1 hour
  }

  private async clearRecordingCache(recordingId: string): Promise<void> {
    const keys = [
      `${this.CACHE_PREFIX}waveform:${recordingId}`,
      `${this.CACHE_PREFIX}analysis:${recordingId}`
    ];

    await Promise.all(keys.map(key => this.redis.del(key)));
  }
}
