import { Service } from 'typedi';
import { Job } from 'bull';
import { AudioProcessingService } from './audio-processing.service';
import { logger } from '@shared/logger';
import { QueueService } from '@shared/services/queue.service';

export interface AudioProcessingJobData {
  recordingId: string;
  userId: string;
  operations: string[];
}

@Service()
export class AudioProcessingQueueProcessor {
  private queueService: QueueService;
  private audioService: AudioProcessingService;

  constructor() {
    // Services will be injected during initialization
  }

  async initialize() {
    try {
      this.queueService = Container.get(QueueService);
      this.audioService = Container.get(AudioProcessingService);

      // Register queue processor
      await this.queueService.process(
        'audio-processing',
        5, // concurrency
        this.processAudioJob.bind(this)
      );

      // Register event handlers
      this.registerEventHandlers();

      logger.info('Audio processing queue processor initialized');
    } catch (error) {
      logger.error('Failed to initialize audio queue processor', error as Error);
      throw error;
    }
  }

  /**
   * Process audio job
   */
  private async processAudioJob(job: Job<AudioProcessingJobData>) {
    const { recordingId, userId, operations } = job.data;

    try {
      logger.info(`Processing audio job ${job.id} for recording ${recordingId}`);

      // Update job progress
      await job.progress(10);

      // Process each operation
      const totalOperations = operations.length;
      let completedOperations = 0;

      for (const operation of operations) {
        logger.debug(`Executing operation: ${operation}`);

        await this.audioService.processAudio({
          recordingId,
          operations: [operation],
          transcriptionLanguage: 'en' // Default, could be passed in job data
        });

        completedOperations++;
        const progress = Math.round((completedOperations / totalOperations) * 90) + 10;
        await job.progress(progress);
      }

      await job.progress(100);
      logger.info(`Audio job ${job.id} completed successfully`);

      return {
        success: true,
        recordingId,
        operations
      };
    } catch (error) {
      logger.error(`Audio job ${job.id} failed`, error as Error);
      throw error;
    }
  }

  /**
   * Register queue event handlers
   */
  private registerEventHandlers() {
    const queue = this.queueService.getQueue('audio-processing');

    queue.on('completed', (job, result) => {
      logger.info(`Audio job ${job.id} completed`, result);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Audio job ${job.id} failed`, err);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Audio job ${job.id} stalled`);
    });

    queue.on('progress', (job, progress) => {
      logger.debug(`Audio job ${job.id} progress: ${progress}%`);
    });
  }

  /**
   * Add cleanup job
   */
  async scheduleCleanupJob(userId: string, daysToKeep: number = 30) {
    await this.queueService.add(
      'audio-processing',
      {
        recordingId: 'cleanup',
        userId,
        operations: ['cleanup'],
        daysToKeep
      },
      {
        delay: 60000, // Run after 1 minute
        removeOnComplete: true,
        removeOnFail: false
      }
    );
  }

  /**
   * Add batch processing job
   */
  async scheduleBatchProcessing(recordingIds: string[], operations: string[]) {
    const jobs = recordingIds.map(recordingId => ({
      name: 'audio-processing',
      data: {
        recordingId,
        userId: 'batch', // Would need actual user ID
        operations
      },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    }));

    await this.queueService.addBulk('audio-processing', jobs);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const queue = this.queueService.getQueue('audio-processing');

    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      total: waiting + active + delayed
    };
  }

  /**
   * Shutdown queue processor
   */
  async shutdown() {
    try {
      const queue = this.queueService.getQueue('audio-processing');
      await queue.close();
      logger.info('Audio processing queue processor shut down');
    } catch (error) {
      logger.error('Error shutting down audio queue processor', error as Error);
    }
  }
}

// Singleton instance
export const audioQueueProcessor = new AudioProcessingQueueProcessor();