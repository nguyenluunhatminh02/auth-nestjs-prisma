import { SetMetadata } from '@nestjs/common';
import { RateLimitConfig } from '../services/rate-limiter.service';

export const RATE_LIMIT_KEY = 'rate_limit';

export type RateLimitType = 'LOGIN' | 'REGISTER' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' | 'MFA' | 'GENERAL' | 'IP';

export const RATE_LIMIT_CONFIGS: Record<RateLimitType, RateLimitConfig> = {
  LOGIN: { limit: 5, window: 900, keyPrefix: 'login' },
  REGISTER: { limit: 3, window: 3600, keyPrefix: 'register' },
  PASSWORD_RESET: { limit: 3, window: 3600, keyPrefix: 'password_reset' },
  EMAIL_VERIFICATION: { limit: 5, window: 3600, keyPrefix: 'email_verify' },
  MFA: { limit: 3, window: 300, keyPrefix: 'mfa' },
  GENERAL: { limit: 100, window: 60, keyPrefix: 'general' },
  IP: { limit: 1000, window: 3600, keyPrefix: 'ip' },
};

export const RateLimit = (config: RateLimitType | RateLimitConfig) => {
  const rateLimitConfig = typeof config === 'string'
    ? RATE_LIMIT_CONFIGS[config]
    : config;
  return SetMetadata(RATE_LIMIT_KEY, rateLimitConfig);
};

