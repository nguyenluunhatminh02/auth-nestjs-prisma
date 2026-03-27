import { HttpException, HttpStatus } from '@nestjs/common';

// ─── Base ─────────────────────────────────────────────────────────────────────
export class AuthException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super({ success: false, message, statusCode: status }, status);
  }
}

// ─── 401 ─────────────────────────────────────────────────────────────────────
export class BadCredentialsException extends AuthException {
  constructor(message = 'Invalid email or password') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class InvalidTokenException extends AuthException {
  constructor(message = 'Token is invalid or expired') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class MfaException extends AuthException {
  constructor(message = 'Invalid MFA code') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

// ─── 403 ─────────────────────────────────────────────────────────────────────
export class EmailNotVerifiedException extends AuthException {
  constructor(message = 'Please verify your email before logging in') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class DeviceLimitExceededException extends AuthException {
  constructor(message = 'Maximum number of devices reached. Please remove a device first.') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

// ─── 404 ─────────────────────────────────────────────────────────────────────
export class ResourceNotFoundException extends AuthException {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, HttpStatus.NOT_FOUND);
  }
}

// ─── 409 ─────────────────────────────────────────────────────────────────────
export class ResourceAlreadyExistsException extends AuthException {
  constructor(resource = 'Resource') {
    super(`${resource} already exists`, HttpStatus.CONFLICT);
  }
}

// ─── 423 ─────────────────────────────────────────────────────────────────────
export class AccountLockedException extends AuthException {
  constructor(message = 'Account is locked due to too many failed attempts. Try again later.') {
    super(message, HttpStatus.valueOf ? 423 : (HttpStatus as any).LOCKED || 423);
  }
}

// ─── 429 ─────────────────────────────────────────────────────────────────────
export class RateLimitExceededException extends AuthException {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

// ─── 400 với violations ──────────────────────────────────────────────────────
export class PasswordValidationException extends HttpException {
  public readonly violations: string[];

  constructor(violations: string[]) {
    super(
      { success: false, message: 'Password does not meet requirements', violations, statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );
    this.violations = violations;
  }
}
