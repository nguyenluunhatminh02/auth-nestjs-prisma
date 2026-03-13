import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as svgCaptcha from 'svg-captcha';
import { RedisService } from './redis.service';

/**
 * Captcha Response Interface
 */
export interface CaptchaResponse {
  /** The CAPTCHA image as SVG string */
  image: string;
  /** The CAPTCHA text (for testing purposes only) */
  text: string;
  /** The CAPTCHA ID */
  id: string;
}

/**
 * Captcha Options Interface
 */
export interface CaptchaOptions {
  /** Number of characters (default: 4) */
  size?: number;
  /** Ignore characters (default: '0o1il') */
  ignoreChars?: string;
  /** Noise level (default: 1) */
  noise?: number;
  /** Color (default: true) */
  color?: boolean;
  /** Background color (default: '#cc9966') */
  background?: string;
  /** Width (default: 150) */
  width?: number;
  /** Height (default: 50) */
  height?: number;
  /** Font size (default: 50) */
  fontSize?: number;
}

/**
 * Captcha Service
 * 
 * Generates and validates CAPTCHA challenges to prevent automated attacks.
 * Stores CAPTCHA tokens in Redis for distributed environments.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly PREFIX = 'captcha:';
  private readonly DEFAULT_TTL = 300; // 5 minutes in seconds
  private readonly DEFAULT_OPTIONS: CaptchaOptions = {
    size: 4,
    ignoreChars: '0o1il',
    noise: 1,
    color: true,
    background: '#cc9966',
    width: 150,
    height: 50,
    fontSize: 50,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate a new CAPTCHA
   * 
   * @param options - Optional CAPTCHA configuration
   * @param ttlSeconds - Optional TTL in seconds (default: 5 minutes)
   * @returns The CAPTCHA response with image, text, and ID
   */
  async generateCaptcha(
    options?: CaptchaOptions,
    ttlSeconds?: number,
  ): Promise<CaptchaResponse> {
    try {
      const captchaOptions = {
        ...this.DEFAULT_OPTIONS,
        ...options,
      };

      // Generate CAPTCHA
      const captcha = svgCaptcha.create(captchaOptions);
      
      // Generate a unique ID for this CAPTCHA
      const id = this.generateCaptchaId();
      
      // Store the CAPTCHA text in Redis
      if (this.redisService.isAvailable()) {
        const key = `${this.PREFIX}${id}`;
        const ttl = ttlSeconds || this.DEFAULT_TTL;
        
        await this.redisService.set(key, captcha.text, ttl);
      } else {
        this.logger.warn('Redis not available, CAPTCHA validation will be limited');
      }

      this.logger.log(`Generated CAPTCHA with ID: ${id}`);
      
      return {
        image: captcha.data,
        text: captcha.text,
        id,
      };
    } catch (error) {
      this.logger.error(`Error generating CAPTCHA: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a CAPTCHA response
   * 
   * @param id - The CAPTCHA ID
   * @param text - The user's CAPTCHA response
   * @returns True if the CAPTCHA is valid, false otherwise
   */
  async validateCaptcha(id: string, text: string): Promise<boolean> {
    if (!this.redisService.isAvailable()) {
      this.logger.warn('Redis not available, cannot validate CAPTCHA');
      return false;
    }

    try {
      const key = `${this.PREFIX}${id}`;
      const storedText = await this.redisService.get(key);
      
      if (!storedText) {
        this.logger.warn(`CAPTCHA not found or expired: ${id}`);
        return false;
      }

      // Case-insensitive comparison
      const isValid = storedText.toLowerCase() === text.toLowerCase();
      
      if (isValid) {
        // Delete the CAPTCHA after successful validation
        await this.redisService.del(key);
        this.logger.log(`CAPTCHA validated successfully: ${id}`);
      } else {
        this.logger.warn(`CAPTCHA validation failed: ${id}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error(`Error validating CAPTCHA: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate a simple text-based CAPTCHA (for API responses)
   * 
   * @param options - Optional CAPTCHA configuration
   * @param ttlSeconds - Optional TTL in seconds (default: 5 minutes)
   * @returns The CAPTCHA response with text and ID
   */
  async generateTextCaptcha(
    options?: CaptchaOptions,
    ttlSeconds?: number,
  ): Promise<{ text: string; id: string }> {
    try {
      const captchaOptions = {
        ...this.DEFAULT_OPTIONS,
        ...options,
      };

      // Generate CAPTCHA
      const captcha = svgCaptcha.createMathExpr({
        ...captchaOptions,
        mathMin: 1,
        mathMax: 9,
        mathOperator: '+-',
      });
      
      // Generate a unique ID for this CAPTCHA
      const id = this.generateCaptchaId();
      
      // Store the CAPTCHA text in Redis
      if (this.redisService.isAvailable()) {
        const key = `${this.PREFIX}${id}`;
        const ttl = ttlSeconds || this.DEFAULT_TTL;
        
        await this.redisService.set(key, captcha.text, ttl);
      } else {
        this.logger.warn('Redis not available, CAPTCHA validation will be limited');
      }

      this.logger.log(`Generated text CAPTCHA with ID: ${id}`);
      
      return {
        text: captcha.text,
        id,
      };
    } catch (error) {
      this.logger.error(`Error generating text CAPTCHA: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revoke a CAPTCHA
   * 
   * @param id - The CAPTCHA ID to revoke
   */
  async revokeCaptcha(id: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }

    try {
      const key = `${this.PREFIX}${id}`;
      await this.redisService.del(key);
      this.logger.log(`Revoked CAPTCHA: ${id}`);
    } catch (error) {
      this.logger.error(`Error revoking CAPTCHA: ${error.message}`);
    }
  }

  /**
   * Generate a unique CAPTCHA ID
   * 
   * @returns A unique CAPTCHA ID
   */
  private generateCaptchaId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
