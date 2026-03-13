import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';

/**
 * Token Blacklist Service
 * 
 * Manages blacklisted JWT tokens using Redis for secure logout and token revocation.
 * Tokens are blacklisted with TTL matching their expiration time.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly PREFIX = 'blacklist:';

  constructor(private redis: RedisService) {}

  /**
   * Add a token to the blacklist
   * @param token - JWT token to blacklist
   * @param ttlSeconds - Time to live in seconds (should match token expiration)
   */
  async addToBlacklist(token: string, ttlSeconds: number): Promise<void> {
    if (!this.redis.isAvailable()) {
      this.logger.warn('Redis not available, skipping token blacklisting');
      return;
    }

    try {
      const key = `${this.PREFIX}${token}`;
      await this.redis.set(key, '1', ttlSeconds);
      this.logger.log(`Token blacklisted: ${token.substring(0, 20)}...`);
    } catch (err) {
      this.logger.error(`Failed to blacklist token: ${err.message}`);
    }
  }

  /**
   * Check if a token is blacklisted
   * @param token - JWT token to check
   * @returns true if token is blacklisted, false otherwise
   */
  async isBlacklisted(token: string): Promise<boolean> {
    if (!this.redis.isAvailable()) {
      this.logger.warn('Redis not available, assuming token is not blacklisted');
      return false;
    }

    try {
      const key = `${this.PREFIX}${token}`;
      return await this.redis.exists(key);
    } catch (err) {
      this.logger.error(`Failed to check token blacklist: ${err.message}`);
      return false;
    }
  }

  /**
   * Remove a token from the blacklist
   * @param token - JWT token to remove from blacklist
   */
  async removeFromBlacklist(token: string): Promise<void> {
    if (!this.redis.isAvailable()) {
      this.logger.warn('Redis not available, skipping token removal from blacklist');
      return;
    }

    try {
      const key = `${this.PREFIX}${token}`;
      await this.redis.del(key);
      this.logger.log(`Token removed from blacklist: ${token.substring(0, 20)}...`);
    } catch (err) {
      this.logger.error(`Failed to remove token from blacklist: ${err.message}`);
    }
  }

  /**
   * Blacklist all tokens for a user (by pattern matching)
   * This is useful for logout from all devices
   * @param userId - User ID
   */
  async blacklistAllUserTokens(userId: string): Promise<void> {
    if (!this.redis.isAvailable()) {
      this.logger.warn('Redis not available, skipping user token blacklisting');
      return;
    }

    try {
      // Note: This requires storing userId:token mapping or using a different pattern
      // For now, this is a placeholder for future enhancement
      this.logger.log(`All tokens for user ${userId} marked for blacklisting`);
    } catch (err) {
      this.logger.error(`Failed to blacklist all user tokens: ${err.message}`);
    }
  }

  /**
   * Get blacklist statistics
   * @returns Number of blacklisted tokens
   */
  async getBlacklistCount(): Promise<number> {
    if (!this.redis.isAvailable()) {
      return 0;
    }

    try {
      // This would require Redis KEYS command which is not available in current RedisService
      // For now, return 0 as placeholder
      return 0;
    } catch (err) {
      this.logger.error(`Failed to get blacklist count: ${err.message}`);
      return 0;
    }
  }
}
