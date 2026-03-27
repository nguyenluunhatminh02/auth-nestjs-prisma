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

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      const token = await this.csrfService.generateSignedToken(sessionId);

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

    // NOTE: Query-parameter CSRF tokens are intentionally NOT supported —
    // they appear in server logs, proxy logs and Referer headers (OWASP).
    return null;
  }

  /**
   * Extract session ID from request.
   *
   * Priority order:
   *  1. Authenticated user ID (set by JwtAuthGuard which runs before this guard).
   *     Using a per-user ID means CSRF tokens are scoped to individual users, not to
   *     a shared IP — which would allow users behind the same NAT/VPN to reuse
   *     each other's tokens.
   *  2. Session ID (express-session, if configured).
   *  3. IP address — last-resort fallback for unauthenticated GET requests only.
   */
  private getSessionId(request: any): string {
    // Prefer the authenticated user's ID (populated by JWT guard)
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    if (request.session?.id) {
      return request.session.id;
    }

    // Only reached for unauthenticated requests (e.g. public GET endpoints)
    return `ip:${request.ip ?? 'unknown'}`;
  }
}
