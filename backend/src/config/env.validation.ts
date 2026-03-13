import { z } from 'zod';

/**
 * Environment Variable Validation Schema
 * 
 * Uses Zod to validate all environment variables at startup.
 * This ensures that required configuration is present and valid.
 */

/**
 * Helper: parse boolean env vars correctly (handles 'true'/'false' strings)
 */
const booleanFromEnv = (defaultValue = false) =>
  z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return defaultValue;
      if (typeof val === 'boolean') return val;
      return String(val).toLowerCase() === 'true' || val === '1';
    },
    z.boolean().default(defaultValue),
  );

/**
 * Database configuration schema
 */
const databaseSchema = z.object({
  host: z.string().min(1, 'DB_HOST is required'),
  port: z.coerce.number().int().positive().default(5432),
  username: z.string().min(1, 'DB_USERNAME is required'),
  password: z.string().min(1, 'DB_PASSWORD is required'),
  name: z.string().min(1, 'DB_NAME is required'),
  synchronize: booleanFromEnv(false),
  logging: booleanFromEnv(false),
  ssl: booleanFromEnv(false),
});

/**
 * Redis configuration schema
 */
const redisSchema = z.object({
  host: z.string().min(1, 'REDIS_HOST is required'),
  port: z.coerce.number().int().positive().default(6379),
  password: z.string().default(''),
  ttl: z.coerce.number().int().positive().default(3600),
});

/**
 * Email configuration schema
 */
const emailSchema = z.object({
  host: z.string().min(1, 'MAIL_HOST is required'),
  port: z.coerce.number().int().positive().default(587),
  user: z.string().default(''),
  pass: z.string().default(''),
  from: z.string().email('MAIL_FROM must be a valid email').default('noreply@ecommerce.local'),
});

/**
 * OAuth2 configuration schema
 */
const oauth2Schema = z.object({
  google: z.object({
    clientId: z.string().default(''),
    clientSecret: z.string().default(''),
    callbackUrl: z.string().url().default('http://localhost:4000/api/v1/auth/oauth2/google/callback'),
  }),
  github: z.object({
    clientId: z.string().default(''),
    clientSecret: z.string().default(''),
    callbackUrl: z.string().url().default('http://localhost:4000/api/v1/auth/oauth2/github/callback'),
  }),
});

/**
 * MinIO configuration schema
 */
const minioSchema = z.object({
  endpoint: z.string().min(1, 'MINIO_ENDPOINT is required'),
  port: z.coerce.number().int().positive().default(9000),
  accessKey: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
  secretKey: z.string().min(1, 'MINIO_SECRET_KEY is required'),
  bucketName: z.string().min(1, 'MINIO_BUCKET_NAME is required'),
  useSSL: booleanFromEnv(false),
  publicUrl: z.string().url().default('http://localhost:9000'),
});

/**
 * Rate limiting configuration schema
 */
const rateLimitSchema = z.object({
  ttl: z.coerce.number().int().positive().default(60000),
  limit: z.coerce.number().int().positive().default(10),
});

/**
 * MFA configuration schema
 */
const mfaSchema = z.object({
  issuer: z.string().default('Ecommerce'),
});

/**
 * Complete environment validation schema
 */
export const envSchema = z.object({
  // Application settings
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // JWT settings
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRATION: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRATION_DAYS: z.coerce.number().int().positive().default(7),

  // Frontend settings
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Sub-configurations
  database: databaseSchema,
  redis: redisSchema,
  email: emailSchema,
  oauth2: oauth2Schema,
  minio: minioSchema,
  rateLimit: rateLimitSchema,
  mfa: mfaSchema,
});

/**
 * Type inference from the schema
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate environment variables
 * 
 * @param env - The environment variables object (usually process.env)
 * @returns Validated and typed configuration
 * @throws Error if validation fails
 */
export function validateEnv(env: Record<string, unknown> = process.env): EnvConfig {
  try {
    // Map environment variables to the schema structure
    const config = {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      JWT_SECRET: env.JWT_SECRET,
      JWT_EXPIRATION: env.JWT_EXPIRATION,
      REFRESH_TOKEN_EXPIRATION_DAYS: env.REFRESH_TOKEN_EXPIRATION_DAYS,
      FRONTEND_URL: env.FRONTEND_URL,
      CORS_ORIGINS: env.CORS_ORIGINS,

      database: {
        host: env.DB_HOST,
        port: env.DB_PORT,
        username: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        name: env.DB_NAME,
        synchronize: env.DB_SYNCHRONIZE,
        logging: env.DB_LOGGING,
        ssl: env.DB_SSL,
      },

      redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        ttl: env.REDIS_TTL,
      },

      email: {
        host: env.MAIL_HOST,
        port: env.MAIL_PORT,
        user: env.MAIL_USERNAME,
        pass: env.MAIL_PASSWORD,
        from: env.MAIL_FROM,
      },

      oauth2: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackUrl: env.GOOGLE_CALLBACK_URL,
        },
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          callbackUrl: env.GITHUB_CALLBACK_URL,
        },
      },

      minio: {
        endpoint: env.MINIO_ENDPOINT,
        port: env.MINIO_PORT,
        accessKey: env.MINIO_ACCESS_KEY,
        secretKey: env.MINIO_SECRET_KEY,
        bucketName: env.MINIO_BUCKET_NAME,
        useSSL: env.MINIO_USE_SSL,
        publicUrl: env.MINIO_PUBLIC_URL,
      },

      rateLimit: {
        ttl: env.RATE_LIMIT_TTL_MS,
        limit: env.RATE_LIMIT_MAX,
      },

      mfa: {
        issuer: env.MFA_ISSUER,
      },
    };

    const validated = envSchema.parse(config);
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(
        (err) => `${err.path.join('.')}: ${err.message}`,
      );
      throw new Error(
        `Environment validation failed:\n${errorMessages.join('\n')}`,
      );
    }
    throw error;
  }
}
