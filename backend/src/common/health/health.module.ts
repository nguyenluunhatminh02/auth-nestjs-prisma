import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health-indicator';
import { MinioHealthIndicator } from './minio.health-indicator';
import { PrismaHealthIndicator } from './prisma.health-indicator';
import { CommonModule } from '../common.module';
import { FilesModule } from '../../files/files.module';

/**
 * Health Module
 * 
 * Provides health check functionality for monitoring the application
 * and its dependencies (database, Redis, MinIO).
 */
@Module({
  imports: [
    TerminusModule,
    CommonModule,
    FilesModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaHealthIndicator,
    RedisHealthIndicator,
    MinioHealthIndicator,
  ],
  exports: [
    PrismaHealthIndicator,
    RedisHealthIndicator,
    MinioHealthIndicator,
  ],
})
export class HealthModule {}
