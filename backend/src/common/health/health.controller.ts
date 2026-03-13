import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
} from '@nestjs/terminus';
import { Public } from '../../auth/decorators/public.decorator';
import { RedisHealthIndicator } from './redis.health-indicator';
import { MinioHealthIndicator } from './minio.health-indicator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaHealthIndicator } from './prisma.health-indicator';

/**
 * Health Controller
 * 
 * Provides health check endpoints for monitoring the application status.
 * Includes checks for database, Redis, and MinIO.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private redis: RedisHealthIndicator,
    private minio: MinioHealthIndicator,
  ) {}

  /**
   * Basic health check
   * Returns 200 OK if the application is running
   */
  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Application is running' })
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Detailed health check
   * Checks the status of all dependencies (database, Redis, MinIO)
   */
  @Get('detailed')
  @HealthCheck()
  @ApiOperation({ summary: 'Detailed health check with dependencies' })
  @ApiResponse({ status: 200, description: 'All dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unhealthy' })
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
      () => this.minio.isHealthy('minio'),
    ]);
  }

  /**
   * Database health check
   * Checks only the database connection
   */
  @Get('database')
  @HealthCheck()
  @ApiOperation({ summary: 'Database health check' })
  @ApiResponse({ status: 200, description: 'Database is healthy' })
  @ApiResponse({ status: 503, description: 'Database is unhealthy' })
  checkDatabase() {
    return this.health.check([() => this.db.isHealthy('database')]);
  }

  /**
   * Redis health check
   * Checks only the Redis connection
   */
  @Get('redis')
  @HealthCheck()
  @ApiOperation({ summary: 'Redis health check' })
  @ApiResponse({ status: 200, description: 'Redis is healthy' })
  @ApiResponse({ status: 503, description: 'Redis is unhealthy' })
  checkRedis() {
    return this.health.check([() => this.redis.isHealthy('redis')]);
  }

  /**
   * MinIO health check
   * Checks only the MinIO connection
   */
  @Get('minio')
  @HealthCheck()
  @ApiOperation({ summary: 'MinIO health check' })
  @ApiResponse({ status: 200, description: 'MinIO is healthy' })
  @ApiResponse({ status: 503, description: 'MinIO is unhealthy' })
  checkMinio() {
    return this.health.check([() => this.minio.isHealthy('minio')]);
  }
}
