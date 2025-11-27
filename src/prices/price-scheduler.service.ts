import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Service for scheduling price persistence jobs using BullMQ
 * Schedules jobs to persist price data to database at regular intervals
 */
@Injectable()
export class PriceSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceSchedulerService.name);
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs = Number(process.env.PRICE_PERSISTENCE_INTERVAL_MS || 60000); // Default: 1 minute

  constructor(
    @InjectQueue('price-persistence')
    private priceQueue: Queue,
  ) {}

  /**
   * Initializes the scheduler when module starts
   * Schedules the first job immediately, then sets up recurring jobs
   */
  onModuleInit() {
    this.logger.log('Starting price persistence scheduler');
    
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
    }
  }

  /**
   * Schedules a price persistence job in the BullMQ queue
   * Configures job with retry logic and cleanup policies
   * @private
   */
  private async scheduleJob() {
    try {
      await this.priceQueue.add('persist-prices', {}, {
        removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
        removeOnFail: { count: 50 }, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
      this.logger.debug('Scheduled price persistence job');
    } catch (error) {
      this.logger.error(`Failed to schedule price persistence job: ${(error as any).message}`);
    }
  }
}

