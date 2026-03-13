import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Device Fingerprint Data
 */
export interface DeviceFingerprintData {
  /** User agent string */
  userAgent?: string;
  /** IP address */
  ipAddress?: string;
  /** Browser name */
  browser?: string;
  /** Operating system */
  os?: string;
  /** Device type (mobile, tablet, desktop) */
  deviceType?: string;
  /** Screen resolution */
  screenResolution?: string;
  /** Language */
  language?: string;
  /** Timezone */
  timezone?: string;
}

/**
 * Device Fingerprint Service
 * 
 * Generates and manages device fingerprints for security purposes.
 * Helps identify trusted devices and detect suspicious login attempts.
 */
@Injectable()
export class DeviceFingerprintService {
  private readonly logger = new Logger(DeviceFingerprintService.name);

  /**
   * Generate a device fingerprint from request data
   * 
   * @param data - The device fingerprint data
   * @returns A unique fingerprint hash
   */
  generateFingerprint(data: DeviceFingerprintData): string {
    try {
      // Create a normalized string from the device data
      const normalizedData = this.normalizeDeviceData(data);
      
      // Generate a hash from the normalized data
      return this.hashData(normalizedData);
    } catch (error) {
      this.logger.error(`Error generating device fingerprint: ${error.message}`);
      return this.generateFallbackFingerprint(data);
    }
  }

  /**
   * Generate a device fingerprint from HTTP request
   * 
   * @param req - The HTTP request object
   * @returns A unique fingerprint hash
   */
  generateFromRequest(req: any): string {
    const data: DeviceFingerprintData = {
      userAgent: req.headers?.['user-agent'],
      ipAddress: this.extractIpAddress(req),
      language: req.headers?.['accept-language'],
    };

    // Parse user agent for additional info
    if (data.userAgent) {
      const parsed = this.parseUserAgent(data.userAgent);
      data.browser = parsed.browser;
      data.os = parsed.os;
      data.deviceType = parsed.deviceType;
    }

    return this.generateFingerprint(data);
  }

  /**
   * Compare two fingerprints for similarity
   * 
   * @param fp1 - First fingerprint
   * @param fp2 - Second fingerprint
   * @returns True if fingerprints match
   */
  compareFingerprints(fp1: string, fp2: string): boolean {
    return fp1 === fp2;
  }

  /**
   * Extract device information from user agent
   * 
   * @param userAgent - The user agent string
   * @returns Parsed device information
   */
  parseUserAgent(userAgent: string): {
    browser: string;
    os: string;
    deviceType: string;
  } {
    // Simple user agent parsing
    // In production, use a library like 'ua-parser-js'
    
    let browser = 'Unknown';
    let os = 'Unknown';
    let deviceType = 'desktop';

    // Browser detection
    if (userAgent.includes('Chrome')) {
      browser = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox';
    } else if (userAgent.includes('Safari')) {
      browser = 'Safari';
    } else if (userAgent.includes('Edge')) {
      browser = 'Edge';
    } else if (userAgent.includes('Opera')) {
      browser = 'Opera';
    }

    // OS detection
    if (userAgent.includes('Windows')) {
      os = 'Windows';
    } else if (userAgent.includes('Mac OS')) {
      os = 'macOS';
    } else if (userAgent.includes('Linux')) {
      os = 'Linux';
    } else if (userAgent.includes('Android')) {
      os = 'Android';
    } else if (userAgent.includes('iOS')) {
      os = 'iOS';
    }

    // Device type detection
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      deviceType = 'mobile';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      deviceType = 'tablet';
    }

    return { browser, os, deviceType };
  }

  /**
   * Extract IP address from request
   * 
   * @param req - The HTTP request object
   * @returns The IP address
   */
  private extractIpAddress(req: any): string {
    // Check for forwarded IP (behind proxy)
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // Check for real IP header
    const realIp = req.headers?.['x-real-ip'];
    if (realIp) {
      return realIp;
    }

    // Fall back to socket IP
    return req.socket?.remoteAddress || req.ip || 'unknown';
  }

  /**
   * Normalize device data for consistent fingerprinting
   * 
   * @param data - The device fingerprint data
   * @returns Normalized data string
   */
  private normalizeDeviceData(data: DeviceFingerprintData): string {
    const parts: string[] = [];

    if (data.userAgent) {
      parts.push(`ua:${data.userAgent}`);
    }
    if (data.ipAddress) {
      parts.push(`ip:${data.ipAddress}`);
    }
    if (data.browser) {
      parts.push(`br:${data.browser}`);
    }
    if (data.os) {
      parts.push(`os:${data.os}`);
    }
    if (data.deviceType) {
      parts.push(`dt:${data.deviceType}`);
    }
    if (data.language) {
      parts.push(`ln:${data.language}`);
    }
    if (data.timezone) {
      parts.push(`tz:${data.timezone}`);
    }

    return parts.join('|');
  }

  /**
   * Hash data to generate fingerprint
   * 
   * @param data - The data to hash
   * @returns The hashed fingerprint
   */
  private hashData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate a fallback fingerprint when error occurs
   * 
   * @param data - The device fingerprint data
   * @returns A simple fallback fingerprint
   */
  private generateFallbackFingerprint(data: DeviceFingerprintData): string {
    const parts: string[] = [];
    
    if (data.userAgent) {
      parts.push(data.userAgent);
    }
    if (data.ipAddress) {
      parts.push(data.ipAddress);
    }
    
    return this.hashData(parts.join('-'));
  }

  /**
   * Generate a device name for display
   * 
   * @param data - The device fingerprint data
   * @returns A human-readable device name
   */
  generateDeviceName(data: DeviceFingerprintData): string {
    const parsed = data.userAgent ? this.parseUserAgent(data.userAgent) : { browser: 'Unknown', os: 'Unknown', deviceType: 'desktop' };
    const parts: string[] = [];
    
    if (parsed.deviceType === 'mobile') {
      parts.push('Mobile');
    } else if (parsed.deviceType === 'tablet') {
      parts.push('Tablet');
    }
    
    if (parsed.browser !== 'Unknown') {
      parts.push(parsed.browser);
    }
    
    if (parsed.os !== 'Unknown') {
      parts.push(parsed.os);
    }
    
    if (parts.length === 0) {
      return 'Unknown Device';
    }
    
    return parts.join(' - ');
  }

  /**
   * Check if device is likely a bot
   * 
   * @param userAgent - The user agent string
   * @returns True if likely a bot
   */
  isLikelyBot(userAgent: string): boolean {
    const botPatterns = [
      /bot/i,
      /crawl/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /headless/i,
      /phantom/i,
      /selenium/i,
    ];

    return botPatterns.some(pattern => pattern.test(userAgent));
  }
}
