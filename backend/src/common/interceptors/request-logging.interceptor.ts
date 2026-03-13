import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Request Logging Interceptor
 * 
 * Logs all HTTP requests and responses with useful information for debugging and monitoring.
 * Logs include: method, URL, IP address, user agent, duration, and status code.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip } = this.extractRequestInfo(request);
    const userAgent = this.extractUserAgent(request);
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          // Log request before it's sent
          this.logger.log(
            `[${method}] ${url} - IP: ${ip}, UA: ${userAgent?.substring(0, 50) || 'Unknown'}`,
          );
        },
        error: (error) => {
          // Log errors
          const duration = Date.now() - startTime;
          this.logger.error(
            `[${method}] ${url} - ERROR: ${error.message} (${duration}ms) - IP: ${ip}`,
          );
        },
        complete: () => {
          // Log response after it's sent
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          const statusColor = statusCode >= 500 ? 'red' : statusCode >= 400 ? 'yellow' : 'green';
          
          this.logger.log(
            `[${method}] ${url} - Status: ${statusCode} (${duration}ms) - IP: ${ip}`,
          );
        },
      }),
    );
  }

  /**
   * Extract request information for logging
   */
  private extractRequestInfo(req: any): {
    method: string;
    url: string;
    ip: string;
  } {
    const method = req.method;
    const url = req.url;
    
    // Get IP address (handle proxies)
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress || req.ip || 'unknown';
    
    return { method, url, ip };
  }

  /**
   * Extract user agent from request headers
   */
  private extractUserAgent(req: any): string | null {
    return req.headers['user-agent'] || null;
  }
}
