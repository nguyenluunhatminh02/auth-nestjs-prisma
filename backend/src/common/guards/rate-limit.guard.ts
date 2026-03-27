import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { RateLimiterService } from '../services/rate-limiter.service';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

/**
 * Rate Limit Guard
 * 
 * Enforces rate limiting on routes decorated with @RateLimit().
 * Uses IP address and user-specific keys for rate limiting.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private reflector: Reflector,
    private rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get rate limit configuration from decorator
    const config = this.reflector.getAllAndOverride(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no rate limit config, allow request
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Build rate limit key
    const key = this.buildRateLimitKey(request, config);

    try {
      // Check rate limit
      const result = await this.rateLimiter.checkRateLimit(key, config);

      // Add rate limit headers to response
      response.setHeader('X-RateLimit-Limit', config.limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      response.setHeader('X-RateLimit-Reset', Math.floor(result.resetTime.getTime() / 1000));

      return true;
    } catch (error) {
      // Rate limit exceeded
      if (error instanceof ForbiddenException) {
        const errorResponse = error.getResponse() as any;
        response.setHeader('X-RateLimit-Limit', config.limit);
        response.setHeader('X-RateLimit-Remaining', 0);
        response.setHeader('X-RateLimit-Reset', Math.floor(new Date(errorResponse.resetTime).getTime() / 1000));
        
        this.logger.warn(`Rate limit exceeded for key: ${key}`);
        throw error;
      }

      // If rate limiter fails, allow request (fail-open)
      this.logger.error(`Rate limiter error: ${error.message}`);
      return true;
    }
  }

  /**
   * Build rate limit key based on request and configuration
   */
  private buildRateLimitKey(request: any, config: any): string {
    const { keyPrefix } = config;

    // Priority: User ID > Email > IP
    if (request.user?.id) {
      return `${keyPrefix}:user:${request.user.id}`;
    }

    if (request.body?.email) {
      // Hash the email so PII doesn't appear in Redis keys or log lines
      const emailHash = createHash('sha256').update(request.body.email.toLowerCase()).digest('hex').substring(0, 16);
      return `${keyPrefix}:email:${emailHash}`;
    }

    if (request.query?.email) {
      const emailHash = createHash('sha256').update((request.query.email as string).toLowerCase()).digest('hex').substring(0, 16);
      return `${keyPrefix}:email:${emailHash}`;
    }

    // Fall back to IP address
    const ip = this.getClientIp(request);
    return `${keyPrefix}:ip:${ip}`;
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(request: any): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    }

    return request.socket?.remoteAddress || request.ip || 'unknown';
  }
}
