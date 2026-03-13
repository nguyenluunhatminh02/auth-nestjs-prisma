import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis Service
 * 
 * Provides Redis connection with retry logic, health checking, and fallback handling.
 * When Redis is unavailable, operations are gracefully skipped with warnings logged.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private isConnected = false;
  private readonly logger = new Logger(RedisService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // 2 seconds

  constructor(private config: ConfigService) {}

  /**
   * Initialize Redis connection with retry logic
   */
  async onModuleInit() {
    await this.connectWithRetry();
  }

  /**
   * Connect to Redis with retry mechanism
   */
  private async connectWithRetry(retryCount = 0): Promise<void> {
    try {
      this.client = new Redis({
        host: this.config.get<string>('redis.host'),
        port: this.config.get<number>('redis.port'),
        password: this.config.get<string>('redis.password') || undefined,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > this.MAX_RETRIES) return null;
          return this.RETRY_DELAY;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

      await this.client.connect();
      this.isConnected = true;
      this.logger.log('Redis connected successfully');

      // Set up error handler for runtime errors
      this.client.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.logger.log('Redis reconnecting...');
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Redis reconnected');
      });
    } catch (err) {
      if (retryCount < this.MAX_RETRIES) {
        this.logger.warn(`Redis connection failed (attempt ${retryCount + 1}/${this.MAX_RETRIES}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.connectWithRetry(retryCount + 1);
      }
      this.logger.error(`Redis connection failed after ${this.MAX_RETRIES} attempts: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (err) {
      this.logger.error(`Redis health check failed: ${err.message}`);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Set a key-value pair with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, skipping set operation for key: ${key}`);
      return;
    }

    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.error(`Redis set error for key ${key}: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, returning null for key: ${key}`);
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.error(`Redis get error for key ${key}: ${err.message}`);
      this.isConnected = false;
      return null;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, skipping delete operation for key: ${key}`);
      return;
    }

    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.error(`Redis del error for key ${key}: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, returning false for key existence check: ${key}`);
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      this.logger.error(`Redis exists error for key ${key}: ${err.message}`);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(keyValuePairs: Record<string, string>): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not available, skipping mset operation');
      return;
    }

    try {
      await this.client.mset(keyValuePairs);
    } catch (err) {
      this.logger.error(`Redis mset error: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Get multiple values by keys
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis not available, returning nulls for mget operation');
      return keys.map(() => null);
    }

    try {
      return await this.client.mget(keys);
    } catch (err) {
      this.logger.error(`Redis mget error: ${err.message}`);
      this.isConnected = false;
      return keys.map(() => null);
    }
  }

  /**
   * Increment a key's value
   */
  async incr(key: string): Promise<number> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, returning 0 for increment operation: ${key}`);
      return 0;
    }

    try {
      return await this.client.incr(key);
    } catch (err) {
      this.logger.error(`Redis incr error for key ${key}: ${err.message}`);
      this.isConnected = false;
      return 0;
    }
  }

  /**
   * Set a key's expiration time
   */
  async expire(key: string, seconds: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, skipping expire operation for key: ${key}`);
      return;
    }

    try {
      await this.client.expire(key, seconds);
    } catch (err) {
      this.logger.error(`Redis expire error for key ${key}: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not available, returning -1 for TTL operation: ${key}`);
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (err) {
      this.logger.error(`Redis ttl error for key ${key}: ${err.message}`);
      this.isConnected = false;
      return -1;
    }
  }

  /**
   * Disconnect from Redis
   */
  async onModuleDestroy() {
    try {
      await this.client.disconnect();
      this.isConnected = false;
      this.logger.log('Redis disconnected');
    } catch (err) {
      this.logger.error(`Redis disconnect error: ${err.message}`);
    }
  }
}
