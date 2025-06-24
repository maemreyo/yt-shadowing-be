// Background job queue service for YouTube Shadowing

import { Service } from 'typedi';
import Bull, { Queue, Job, JobOptions, ProcessorFunction } from 'bull';
import { RedisService } from '@shared/services/redis.service';
import { ConfigService } from '@shared/services/config.service';
import { EventEmitter } from '@shared/events/event-emitter';
import { logger } from '@shared/logger';

export interface QueueConfig {
  name: string;
  concurrency: number;
  defaultJobOptions?: JobOptions;
  processors: Map<string, ProcessorFunction<any>>;
}

export interface JobResult<T = any> {
  jobId: string;
  data: T;
  processedAt: Date;
  duration: number;
}

@Service()
export class ShadowingQueueService {
  private queues = new Map<string, Queue>();

  // Queue configurations
  private readonly QUEUE_CONFIGS: Record<string, Partial<QueueConfig>> = {
    // Audio processing queue
    'audio-processing': {
      concurrency: 5,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    },

    // Transcript processing queue
    'transcript-processing': {
      concurrency: 10,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        timeout: 60000 // 1 minute
      }
    },

    // Analytics aggregation queue
    'analytics-aggregation': {
      concurrency: 3,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 5000
        }
      }
    },

    // Report generation queue
    'report-generation': {
      concurrency: 2,
      defaultJobOptions: {
        attempts: 2,
        timeout: 300000 // 5 minutes
      }
    },

    // Notification queue
    'notifications': {
      concurrency: 20,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    }
  };

  constructor(
    private redis: RedisService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    try {
      // Create Redis connection for Bull
      const redisConfig = {
        host: this.configService.get('REDIS_HOST') || 'localhost',
        port: parseInt(this.configService.get('REDIS_PORT') || '6379'),
        password: this.configService.get('REDIS_PASSWORD'),
        db: parseInt(this.configService.get('REDIS_QUEUE_DB') || '1')
      };

      // Initialize each queue
      for (const [queueName, config] of Object.entries(this.QUEUE_CONFIGS)) {
        const queue = new Bull(queueName, {
          redis: redisConfig,
          defaultJobOptions: config.defaultJobOptions
        });

        // Setup event handlers
        this.setupQueueEvents(queue, queueName);

        this.queues.set(queueName, queue);

        logger.info(`Queue initialized: ${queueName}`, {
          concurrency: config.concurrency
        });
      }

      // Register job processors
      await this.registerProcessors();

      logger.info('All queues initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queues', error as Error);
      throw error;
    }
  }

  /**
   * Register job processors
   */
  private async registerProcessors(): Promise<void> {
    // Audio processing jobs
    this.registerProcessor('audio-processing', 'process-recording', this.processRecording.bind(this));
    this.registerProcessor('audio-processing', 'generate-waveform', this.generateWaveform.bind(this));
    this.registerProcessor('audio-processing', 'transcribe-audio', this.transcribeAudio.bind(this));
    this.registerProcessor('audio-processing', 'compare-audio', this.compareAudio.bind(this));

    // Transcript processing jobs
    this.registerProcessor('transcript-processing', 'fetch-transcript', this.fetchTranscript.bind(this));
    this.registerProcessor('transcript-processing', 'process-transcript', this.processTranscript.bind(this));
    this.registerProcessor('transcript-processing', 'analyze-difficulty', this.analyzeDifficulty.bind(this));

    // Analytics jobs
    this.registerProcessor('analytics-aggregation', 'aggregate-daily', this.aggregateDailyStats.bind(this));
    this.registerProcessor('analytics-aggregation', 'calculate-streaks', this.calculateStreaks.bind(this));
    this.registerProcessor('analytics-aggregation', 'generate-insights', this.generateInsights.bind(this));

    // Report generation jobs
    this.registerProcessor('report-generation', 'weekly-report', this.generateWeeklyReport.bind(this));
    this.registerProcessor('report-generation', 'progress-report', this.generateProgressReport.bind(this));

    // Notification jobs
    this.registerProcessor('notifications', 'send-email', this.sendEmailNotification.bind(this));
    this.registerProcessor('notifications', 'send-push', this.sendPushNotification.bind(this));
  }

  /**
   * Register a job processor
   */
  registerProcessor(
    queueName: string,
    jobType: string,
    processor: ProcessorFunction<any>
  ): void {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const config = this.QUEUE_CONFIGS[queueName];

    queue.process(jobType, config?.concurrency || 1, async (job: Job) => {
      const startTime = Date.now();

      try {
        logger.info(`Processing job ${jobType}`, {
          queue: queueName,
          jobId: job.id,
          attemptNumber: job.attemptsMade + 1
        });

        const result = await processor(job);

        const duration = Date.now() - startTime;

        logger.info(`Job completed: ${jobType}`, {
          queue: queueName,
          jobId: job.id,
          duration
        });

        return {
          jobId: job.id,
          data: result,
          processedAt: new Date(),
          duration
        };
      } catch (error) {
        logger.error(`Job failed: ${jobType}`, {
          queue: queueName,
          jobId: job.id,
          error: (error as Error).message,
          stack: (error as Error).stack
        });

        throw error;
      }
    });
  }

  /**
   * Add job to queue
   */
  async addJob<T = any>(
    queueName: string,
    jobType: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobType, data, {
      ...this.QUEUE_CONFIGS[queueName]?.defaultJobOptions,
      ...options
    });

    logger.info(`Job added to queue`, {
      queue: queueName,
      jobType,
      jobId: job.id
    });

    return job;
  }

  /**
   * Add bulk jobs
   */
  async addBulkJobs<T = any>(
    queueName: string,
    jobs: Array<{ type: string; data: T; options?: JobOptions }>
  ): Promise<Job<T>[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const bulkJobs = jobs.map(({ type, data, options }) => ({
      name: type,
      data,
      opts: {
        ...this.QUEUE_CONFIGS[queueName]?.defaultJobOptions,
        ...options
      }
    }));

    const addedJobs = await queue.addBulk(bulkJobs);

    logger.info(`Bulk jobs added to queue`, {
      queue: queueName,
      count: addedJobs.length
    });

    return addedJobs;
  }

  /**
   * Get queue status
   */
  async getQueueStatus(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused()
    ]);

    return { waiting, active, completed, failed, delayed, paused };
  }

  /**
   * Pause/resume queue
   */
  async pauseQueue(queueName: string, pause: boolean = true): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    if (pause) {
      await queue.pause();
      logger.info(`Queue paused: ${queueName}`);
    } else {
      await queue.resume();
      logger.info(`Queue resumed: ${queueName}`);
    }
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(
    queueName: string,
    grace: number = 3600000, // 1 hour
    limit: number = 1000,
    status: 'completed' | 'failed' = 'completed'
  ): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobs = await queue.clean(grace, status, limit);

    logger.info(`Queue cleaned: ${queueName}`, {
      removed: jobs.length,
      status
    });

    return jobs.length;
  }

  // Job processors

  private async processRecording(job: Job): Promise<any> {
    const { userId, recordingId, audioBuffer } = job.data;

    // Simulate audio processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Emit event when done
    this.eventEmitter.emit('audio:processing-complete', {
      userId,
      recordingId,
      jobId: job.id
    });

    return { processed: true, recordingId };
  }

  private async generateWaveform(job: Job): Promise<any> {
    const { recordingId, audioUrl } = job.data;

    // Simulate waveform generation
    const waveformData = {
      peaks: Array(100).fill(0).map(() => Math.random()),
      duration: 180
    };

    return { recordingId, waveformData };
  }

  private async transcribeAudio(job: Job): Promise<any> {
    const { recordingId, audioUrl, service } = job.data;

    // Simulate transcription
    await new Promise(resolve => setTimeout(resolve, 3000));

    return {
      recordingId,
      transcription: 'Sample transcription text',
      confidence: 0.95
    };
  }

  private async compareAudio(job: Job): Promise<any> {
    const { userRecordingId, originalAudioId } = job.data;

    // Simulate audio comparison
    return {
      similarity: 0.85,
      pronunciation: 0.90,
      timing: 0.80,
      fluency: 0.87
    };
  }

  private async fetchTranscript(job: Job): Promise<any> {
    const { videoId, language } = job.data;

    // Simulate transcript fetching
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      videoId,
      language,
      transcript: { sentences: [] }
    };
  }

  private async processTranscript(job: Job): Promise<any> {
    const { transcript, videoId } = job.data;

    // Simulate transcript processing
    return {
      videoId,
      sentenceCount: 50,
      difficulty: 3
    };
  }

  private async analyzeDifficulty(job: Job): Promise<any> {
    const { transcript } = job.data;

    // Simulate difficulty analysis
    return {
      overall: 3,
      vocabulary: 2.5,
      sentenceComplexity: 3.5,
      speakingRate: 3
    };
  }

  private async aggregateDailyStats(job: Job): Promise<any> {
    const { userId, date } = job.data;

    // Simulate aggregation
    return {
      userId,
      date,
      stats: {
        minutesPracticed: 45,
        sentencesCompleted: 30,
        averageScore: 85
      }
    };
  }

  private async calculateStreaks(job: Job): Promise<any> {
    const { userId } = job.data;

    // Simulate streak calculation
    return {
      userId,
      currentStreak: 7,
      longestStreak: 14
    };
  }

  private async generateInsights(job: Job): Promise<any> {
    const { userId, period } = job.data;

    // Simulate insights generation
    return {
      userId,
      period,
      insights: [
        'Your pronunciation has improved by 15%',
        'You practice most effectively in the morning'
      ]
    };
  }

  private async generateWeeklyReport(job: Job): Promise<any> {
    const { userId, weekStart } = job.data;

    // Simulate report generation
    return {
      userId,
      weekStart,
      reportUrl: '/reports/weekly-123.pdf'
    };
  }

  private async generateProgressReport(job: Job): Promise<any> {
    const { userId, startDate, endDate } = job.data;

    // Simulate report generation
    return {
      userId,
      period: { startDate, endDate },
      reportUrl: '/reports/progress-456.pdf'
    };
  }

  private async sendEmailNotification(job: Job): Promise<any> {
    const { userId, type, data } = job.data;

    // Simulate email sending
    return {
      sent: true,
      messageId: 'msg-789'
    };
  }

  private async sendPushNotification(job: Job): Promise<any> {
    const { userId, title, message } = job.data;

    // Simulate push notification
    return {
      sent: true,
      notificationId: 'notif-012'
    };
  }

  /**
   * Setup queue event handlers
   */
  private setupQueueEvents(queue: Queue, queueName: string): void {
    queue.on('completed', (job: Job, result: any) => {
      this.eventEmitter.emit('queue:job-completed', {
        queue: queueName,
        jobId: job.id,
        jobType: job.name,
        result
      });
    });

    queue.on('failed', (job: Job, error: Error) => {
      logger.error(`Job failed in queue ${queueName}`, {
        jobId: job.id,
        jobType: job.name,
        error: error.message,
        attemptsMade: job.attemptsMade
      });

      this.eventEmitter.emit('queue:job-failed', {
        queue: queueName,
        jobId: job.id,
        jobType: job.name,
        error: error.message
      });
    });

    queue.on('stalled', (job: Job) => {
      logger.warn(`Job stalled in queue ${queueName}`, {
        jobId: job.id,
        jobType: job.name
      });
    });

    queue.on('error', (error: Error) => {
      logger.error(`Queue error: ${queueName}`, error);
    });
  }

  /**
   * Gracefully shutdown all queues
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down job queues...');

    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);

    logger.info('All queues shut down successfully');
  }
}
