import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { FileStorageService } from '../../files/files.service';

/**
 * MinIO Health Indicator
 * 
 * Checks the health of the MinIO connection.
 * Returns a HealthIndicatorResult with the status of MinIO.
 */
@Injectable()
export class MinioHealthIndicator extends HealthIndicator {
  constructor(private readonly fileStorageService: FileStorageService) {
    super();
  }

  /**
   * Check MinIO health
   * 
   * @param key - The key to identify this health check (default: 'minio')
   * @returns HealthIndicatorResult with MinIO status
   * @throws HealthCheckError if MinIO is not healthy
   */
  async isHealthy(key: string = 'minio'): Promise<HealthIndicatorResult> {
    try {
      const isHealthy = await this.fileStorageService.healthCheck();
      
      if (!isHealthy) {
        throw new HealthCheckError('MinIO connection failed', this.getStatus(key, false));
      }

      return this.getStatus(key, true, {
        message: 'MinIO connection is healthy',
      });
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw error;
      }
      
      throw new HealthCheckError(
        'MinIO health check failed',
        this.getStatus(key, false, {
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    }
  }
}
