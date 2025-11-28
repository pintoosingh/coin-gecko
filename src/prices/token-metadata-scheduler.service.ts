import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Service for scheduling token metadata persistence jobs using BullMQ
 * Schedules jobs to fetch and store token metadata (contract addresses, categories, etc.) in tokens table
 */
@Injectable()
export class TokenMetadataSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenMetadataSchedulerService.name);
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs = Number(process.env.TOKEN_METADATA_INTERVAL_MS || 24 * 60 * 60 * 1000); // Default: 24 hours

  constructor(
    @InjectQueue('token-metadata')
    private tokenMetadataQueue: Queue,
  ) {}

  /**
   * Initializes the scheduler when module starts
   * Schedules the first job immediately, then sets up recurring jobs
   */
  onModuleInit() {
    this.logger.log('Starting token metadata scheduler');
    
    // Schedule initial job
    this.scheduleJob();

    // Schedule recurring jobs
    this.schedulerInterval = setInterval(() => {
      this.scheduleJob();
    }, this.intervalMs);
  }

  /**
   * Cleans up scheduler resources when module is destroyed
   * Stops the recurring job scheduler
   */
  onModuleDestroy() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      this.logger.log('Token metadata scheduler stopped');
    }
  }

  /**
   * Schedules a token metadata persistence job in the BullMQ queue
   * Configures job with retry logic and cleanup policies
   * @private
   */
  private async scheduleJob() {
    try {
      await this.tokenMetadataQueue.add('persist-metadata', {}, {
        removeOnComplete: { count: 10 }, // Keep last 10 completed jobs
        removeOnFail: { count: 5 }, // Keep last 5 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
      this.logger.debug('Scheduled token metadata persistence job');
    } catch (error) {
      this.logger.error(`Failed to schedule token metadata job: ${(error as any).message}`);
    }
  }
}

