import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import * as path from 'path';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export interface FileUploadResult {
  fileName: string;
  fileUrl: string;
  contentType: string;
  size: number;
}

/**
 * File Storage Service
 * 
 * Provides MinIO file storage with retry logic, health checking, and fallback handling.
 * When MinIO is unavailable, operations throw appropriate errors with detailed logging.
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string;
  private publicUrl: string;
  private isAvailable = false;
  private readonly logger = new Logger(FileStorageService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // 2 seconds

  constructor(private config: ConfigService) {
    this.bucket = config.get<string>('minio.bucketName');
    this.publicUrl = config.get<string>('minio.publicUrl');

    this.client = new Minio.Client({
      endPoint: config.get<string>('minio.endpoint'),
      port: config.get<number>('minio.port'),
      useSSL: config.get<boolean>('minio.useSSL'),
      accessKey: config.get<string>('minio.accessKey'),
      secretKey: config.get<string>('minio.secretKey'),
    });
  }

  /**
   * Initialize MinIO connection and create bucket if needed
   */
  async onModuleInit() {
    await this.initializeWithRetry();
  }

  /**
   * Initialize MinIO with retry mechanism
   */
  private async initializeWithRetry(retryCount = 0): Promise<void> {
    try {
      // Test connection by checking if bucket exists
      const exists = await this.client.bucketExists(this.bucket);
      
      if (!exists) {
        await this.createBucketWithRetry();
      }

      this.isAvailable = true;
      this.logger.log(`MinIO initialized successfully for bucket: ${this.bucket}`);
    } catch (err) {
      if (retryCount < this.MAX_RETRIES) {
        this.logger.warn(`MinIO initialization failed (attempt ${retryCount + 1}/${this.MAX_RETRIES}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.initializeWithRetry(retryCount + 1);
      }
      this.logger.error(`MinIO initialization failed after ${this.MAX_RETRIES} attempts: ${err.message}`);
      this.isAvailable = false;
    }
  }

  /**
   * Create bucket with retry mechanism
   */
  private async createBucketWithRetry(retryCount = 0): Promise<void> {
    try {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created bucket: ${this.bucket}`);
      
      // Set bucket policy to public read
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      };
      await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
      this.logger.log(`Set public policy for bucket: ${this.bucket}`);
    } catch (err) {
      if (retryCount < this.MAX_RETRIES) {
        this.logger.warn(`MinIO bucket creation failed (attempt ${retryCount + 1}/${this.MAX_RETRIES}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.createBucketWithRetry(retryCount + 1);
      }
      this.logger.error(`MinIO bucket creation failed after ${this.MAX_RETRIES} attempts: ${err.message}`);
      throw err;
    }
  }

  /**
   * Check if MinIO is available
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Health check for MinIO connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.listBuckets();
      this.isAvailable = true;
      return true;
    } catch (err) {
      this.logger.error(`MinIO health check failed: ${err.message}`);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Upload a file to MinIO
   */
  async uploadFile(
    file: Express.Multer.File,
    folder = 'uploads',
  ): Promise<FileUploadResult> {
    if (!this.isAvailable) {
      throw new BadRequestException('File storage service is currently unavailable');
    }

    if (!file) throw new BadRequestException('No file provided');
    if (!file.mimetype) {
      throw new BadRequestException('Invalid file content type');
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const ext = path.extname(file.originalname);
    const uniqueName = `${folder}/${crypto.randomUUID()}${ext}`;

    try {
      await this.client.putObject(this.bucket, uniqueName, file.buffer, file.size, {
        'Content-Type': file.mimetype,
      });

      return {
        fileName: uniqueName,
        fileUrl: `${this.publicUrl}/${this.bucket}/${uniqueName}`,
        contentType: file.mimetype,
        size: file.size,
      };
    } catch (err) {
      this.logger.error(`File upload failed: ${err.message}`);
      this.isAvailable = false;
      throw new BadRequestException('Failed to upload file. Please try again later.');
    }
  }

  /**
   * Upload an avatar image
   */
  async uploadAvatar(file: Express.Multer.File): Promise<FileUploadResult> {
    if (!this.isAvailable) {
      throw new BadRequestException('File storage service is currently unavailable');
    }

    if (!file) throw new BadRequestException('No file provided');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image');
    }
    return this.uploadFile(file, 'avatars');
  }

  /**
   * Delete a file from MinIO
   */
  async deleteFile(fileName: string): Promise<void> {
    if (!this.isAvailable) {
      throw new BadRequestException('File storage service is currently unavailable');
    }

    // Prevent path traversal attacks
    if (!fileName || fileName.includes('..') || fileName.startsWith('/')) {
      throw new BadRequestException('Invalid file name');
    }

    try {
      await this.client.removeObject(this.bucket, fileName);
      this.logger.log(`Deleted file: ${fileName}`);
    } catch (err) {
      this.logger.error(`File deletion failed for ${fileName}: ${err.message}`);
      throw new BadRequestException('Failed to delete file. Please try again later.');
    }
  }


  /**
   * Generate a presigned URL for temporary access
   */
  async getPresignedUrl(fileName: string, expirySeconds = 3600): Promise<string> {
    if (!this.isAvailable) {
      throw new BadRequestException('File storage service is currently unavailable');
    }

    // Prevent path traversal attacks
    if (!fileName || fileName.includes('..') || fileName.startsWith('/')) {
      throw new BadRequestException('Invalid file name');
    }

    try {
      return await this.client.presignedGetObject(this.bucket, fileName, expirySeconds);
    } catch (err) {
      this.logger.error(`Generate presigned URL failed for ${fileName}: ${err.message}`);
      throw new BadRequestException('Failed to generate presigned URL');
    }
  }
}
