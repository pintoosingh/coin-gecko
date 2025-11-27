import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis service for managing Redis connection
 * Provides centralized Redis client management with lazy initialization
 * Handles connection lifecycle and error management
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);

  /**
   * Initializes Redis client when module starts
   * Connects to Redis using REDIS_URL environment variable or default localhost
   */
  onModuleInit() {
    try {
      if (!this.client) {
        const url = process.env.REDIS_URL || 'redis://localhost:6379';
        this.client = new Redis(url);
        this.client.on('error', (err) => this.logger.error('Redis error', err));
        this.logger.log('Redis client initialized in onModuleInit');
      }
    } catch (err) {
      this.logger.error('Failed to initialize redis client in onModuleInit', err);
    }
  }

  /**
   * Gets the Redis client instance
   * Performs lazy initialization if client is not yet created
   * @returns Redis client instance
   */
  /**
   * Gets the Redis client instance
   * Performs lazy initialization if client is not yet created
   * @returns Redis client instance
   */
  getClient(): Redis {
    // lazy init as fallback
    if (!this.client) {
      const url = process.env.REDIS_URL || 'redis://localhost:6379';
      this.logger.warn('Redis client lazily initialized from getClient()');
      this.client = new Redis(url);
      this.client.on('error', (err) => this.logger.error('Redis error', err));
    }
    return this.client;
  }

  async onModuleDestroy() {
    try {
      if (this.client) await this.client.quit();
    } catch (err) {
      // ignore
    }
  }
}

