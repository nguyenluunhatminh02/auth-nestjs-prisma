/** Bcrypt hash rounds for password hashing */
export const BCRYPT_ROUNDS = 12;

/** Maximum consecutive failed login attempts before account lock */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Account lock duration in milliseconds (30 minutes) */
export const ACCOUNT_LOCK_DURATION_MS = 30 * 60 * 1000;

/** Email verification token lifetime in milliseconds (24 hours) */
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Password reset token lifetime in milliseconds (1 hour) */
export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

/** Account deletion grace period in milliseconds (30 days) */
export const DELETE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** MFA temporary token TTL in seconds (5 minutes) */
export const MFA_TEMP_TTL = 300;
