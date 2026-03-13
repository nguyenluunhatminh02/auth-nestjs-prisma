import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { RedisService } from '../../common/services/redis.service';

/**
 * Email Verification Token Service
 * 
 * Manages email verification tokens using Redis for fast access and automatic expiration.
 * Tokens are stored with a configurable TTL (time to live).
 */
@Injectable()
export class EmailVerificationTokenService {
  private readonly logger = new Logger(EmailVerificationTokenService.name);
  private readonly TOKEN_LENGTH = 32;
  private readonly PREFIX = 'email_verification:';
  private readonly DEFAULT_TTL = 3600; // 1 hour in seconds

  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate a new email verification token
   * 
   * @param email - The email address to verify
   * @param userId - The user ID associated with the email
   * @param ttlSeconds - Optional TTL in seconds (default: 1 hour)
   * @returns The generated token
   */
  async generateToken(
    email: string,
    userId: string,
    ttlSeconds?: number,
  ): Promise<string> {
    if (!this.redisService.isAvailable()) {
      this.logger.warn('Redis not available, falling back to in-memory token generation');
      return this.generateInMemoryToken(email, userId);
    }

    try {
      // Generate a random token
      const token = randomBytes(this.TOKEN_LENGTH).toString('hex');
      
      // Create the key
      const key = `${this.PREFIX}${token}`;
      
      // Store the token with user data
      const value = JSON.stringify({
        email,
        userId,
        createdAt: new Date().toISOString(),
      });
      
      // Set TTL
      const ttl = ttlSeconds || this.DEFAULT_TTL;
      
      await this.redisService.set(key, value, ttl);
      
      this.logger.log(`Generated email verification token for ${email}`);
      return token;
    } catch (error) {
      this.logger.error(`Error generating email verification token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify an email verification token
   * 
   * @param token - The token to verify
   * @returns The token data (email, userId) if valid, null otherwise
   */
  async verifyToken(token: string): Promise<{ email: string; userId: string } | null> {
    if (!this.redisService.isAvailable()) {
      this.logger.warn('Redis not available, cannot verify token');
      return null;
    }

    try {
      const key = `${this.PREFIX}${token}`;
      const value = await this.redisService.get(key);
      
      if (!value) {
        this.logger.warn(`Invalid or expired email verification token`);
        return null;
      }

      const data = JSON.parse(value);
      
      // Optionally, delete the token after verification
      await this.redisService.del(key);
      
      this.logger.log(`Verified email verification token for ${data.email}`);
      return {
        email: data.email,
        userId: data.userId,
      };
    } catch (error) {
      this.logger.error(`Error verifying email verification token: ${error.message}`);
      return null;
    }
  }

  /**
   * Revoke an email verification token
   * 
   * @param token - The token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      this.logger.warn('Redis not available, cannot revoke token');
      return;
    }

    try {
      const key = `${this.PREFIX}${token}`;
      await this.redisService.del(key);
      this.logger.log(`Revoked email verification token`);
    } catch (error) {
      this.logger.error(`Error revoking email verification token: ${error.message}`);
    }
  }

  /**
   * Revoke all tokens for a specific email
   * 
   * @param email - The email address
   */
  async revokeAllTokensForEmail(email: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      this.logger.warn('Redis not available, cannot revoke tokens');
      return;
    }

    try {
      // Note: This would require scanning Redis keys, which can be expensive
      // For production, consider maintaining an index of tokens per email
      this.logger.warn(`Revoking all tokens for email ${email} - not implemented in Redis`);
    } catch (error) {
      this.logger.error(`Error revoking tokens for email: ${error.message}`);
    }
  }

  /**
   * Check if a token exists and is valid
   * 
   * @param token - The token to check
   * @returns True if the token exists and is valid
   */
  async tokenExists(token: string): Promise<boolean> {
    if (!this.redisService.isAvailable()) {
      return false;
    }

    try {
      const key = `${this.PREFIX}${token}`;
      return await this.redisService.exists(key);
    } catch (error) {
      this.logger.error(`Error checking token existence: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate a token hash for verification without Redis
   * 
   * @param email - The email address
   * @param userId - The user ID
   * @returns A hash-based token
   */
  private generateInMemoryToken(email: string, userId: string): string {
    const timestamp = Date.now().toString();
    const secret = this.config.get<string>('JWT_SECRET', 'default-secret');
    const data = `${email}:${userId}:${timestamp}:${secret}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify a hash-based token without Redis
   * 
   * @param token - The token to verify
   * @param email - The email address
   * @param userId - The user ID
   * @param maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns True if the token is valid and not expired
   */
  async verifyInMemoryToken(
    token: string,
    email: string,
    userId: string,
    maxAge: number = 3600000,
  ): Promise<boolean> {
    const secret = this.config.get<string>('JWT_SECRET', 'default-secret');
    for (let i = 0; i < 60; i++) {
      const timestamp = Date.now() - (i * 60000); // Check each minute
      const data = `${email}:${userId}:${timestamp.toString()}:${secret}`;
      const hash = createHash('sha256').update(data).digest('hex');
      
      if (hash === token) {
        const age = Date.now() - timestamp;
        return age <= maxAge;
      }
    }
    
    return false;
  }
}
