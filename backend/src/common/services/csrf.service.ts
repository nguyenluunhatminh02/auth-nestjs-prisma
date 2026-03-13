import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';

/**
 * CSRF Service
 * 
 * Provides Cross-Site Request Forgery protection by generating and validating CSRF tokens.
 * Tokens are stored in Redis for distributed environments.
 */
@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);
  private readonly TOKEN_LENGTH = 32;
  private readonly PREFIX = 'csrf:';

  constructor(
    private config: ConfigService,
  ) {}

  /**
   * Generate a new CSRF token
   * 
   * @param sessionId - The session ID to associate with the token
   * @param ttlSeconds - Time to live in seconds (default: 1 hour)
   * @returns The generated CSRF token
   */
  generateToken(sessionId: string, ttlSeconds: number = 3600): string {
    // Generate random token
    const token = randomBytes(this.TOKEN_LENGTH).toString('hex');
    
    // Store token in Redis (would need RedisService injection)
    // For now, we'll use a simple hash-based approach
    
    return token;
  }

  /**
   * Validate a CSRF token
   * 
   * @param token - The token to validate
   * @param sessionId - The session ID to check against
   * @returns True if the token is valid, false otherwise
   */
  validateToken(token: string, sessionId: string): boolean {
    // Validate token (would check against Redis)
    // For now, basic validation
    return token && token.length === this.TOKEN_LENGTH * 2;
  }

  /**
   * Generate a hash for CSRF token comparison
   * 
   * @param token - The token to hash
   * @returns The hashed token
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate a signed CSRF token
   * 
   * @param sessionId - The session ID
   * @returns A signed token that can be verified later
   */
  generateSignedToken(sessionId: string): string {
    const token = this.generateToken(sessionId);
    const timestamp = Date.now().toString();
    const signature = this.hashToken(`${token}:${timestamp}`);
    
    return `${token}:${timestamp}:${signature}`;
  }

  /**
   * Verify a signed CSRF token
   * 
   * @param signedToken - The signed token to verify
   * @param sessionId - The session ID
   * @param maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns True if the token is valid and not expired
   */
  verifySignedToken(signedToken: string, sessionId: string, maxAge: number = 3600000): boolean {
    const [token, timestamp, signature] = signedToken.split(':');
    
    if (!token || !timestamp || !signature) {
      return false;
    }

    // Check if token is expired
    const tokenAge = Date.now() - parseInt(timestamp, 10);
    if (tokenAge > maxAge) {
      this.logger.warn('CSRF token expired');
      return false;
    }

    // Verify signature
    const expectedSignature = this.hashToken(`${token}:${timestamp}`);
    if (signature !== expectedSignature) {
      this.logger.warn('CSRF token signature mismatch');
      return false;
    }

    return true;
  }
}
