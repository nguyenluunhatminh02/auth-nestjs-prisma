import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfService } from '../services/csrf.service';

/**
 * CSRF Guard
 * 
 * Protects routes from Cross-Site Request Forgery attacks by validating CSRF tokens.
 * Routes decorated with @Public() are exempt from CSRF protection.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);
  private readonly HEADER_NAME = 'x-csrf-token';

  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is public (exempt from CSRF)
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // For GET, HEAD, OPTIONS requests, generate and set CSRF token
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const sessionId = this.getSessionId(request);
      const token = this.csrfService.generateSignedToken(sessionId);
      
      // Set CSRF token in response header and cookie
      response.setHeader(this.HEADER_NAME, token);
      response.cookie('csrf_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000, // 1 hour
      });
      
      return true;
    }

    // For state-changing requests (POST, PUT, DELETE, PATCH), validate CSRF token
    const token = this.extractToken(request);
    
    if (!token) {
      this.logger.warn('CSRF token missing from request');
      throw new BadRequestException('CSRF token is required');
    }

    const sessionId = this.getSessionId(request);
    const isValid = this.csrfService.verifySignedToken(token, sessionId);

    if (!isValid) {
      this.logger.warn('Invalid CSRF token');
      throw new BadRequestException('Invalid CSRF token');
    }

    return true;
  }

  /**
   * Extract CSRF token from request
   * 
   * @param request - The HTTP request
   * @returns The CSRF token or null if not found
   */
  private extractToken(request: any): string | null {
    // Check header first
    const headerToken = request.headers[this.HEADER_NAME];
    if (headerToken) {
      return headerToken;
    }

    // Check body
    const bodyToken = request.body?.csrf_token;
    if (bodyToken) {
      return bodyToken;
    }

    // Check query parameter (not recommended, but included for compatibility)
    const queryToken = request.query?.csrf_token;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }

  /**
   * Extract session ID from request
   * 
   * @param request - The HTTP request
   * @returns The session ID or a default value
   */
  private getSessionId(request: any): string {
    // Try to get session ID from request
    if (request.session?.id) {
      return request.session.id;
    }

    // Fall back to IP address (not ideal, but works for simple cases)
    return request.ip || 'unknown';
  }
}
