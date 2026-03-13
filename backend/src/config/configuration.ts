import { validateEnv, EnvConfig } from './env.validation';

/**
 * Configuration factory function
 *
 * Validates environment variables using Zod and returns a typed configuration object.
 * This ensures all required environment variables are present and valid at startup.
 *
 * @returns Validated configuration object
 * @throws Error if environment validation fails
 */
export default (): EnvConfig => {
  return validateEnv();
};
