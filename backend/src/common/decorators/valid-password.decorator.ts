import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Password Validation Options
 * Configuration for password strength requirements
 */
export interface PasswordValidationOptions {
  /** Minimum length (default: 8) */
  minLength?: number;
  /** Maximum length (default: 128) */
  maxLength?: number;
  /** Require at least one uppercase letter (default: true) */
  requireUppercase?: boolean;
  /** Require at least one lowercase letter (default: true) */
  requireLowercase?: boolean;
  /** Require at least one number (default: true) */
  requireNumber?: boolean;
  /** Require at least one special character (default: true) */
  requireSpecialChar?: boolean;
}

/**
 * Default password validation options
 */
const DEFAULT_PASSWORD_OPTIONS: PasswordValidationOptions = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

/**
 * Password Validator Constraint
 * Implements the actual password validation logic
 */
@ValidatorConstraint({ name: 'validPassword', async: false })
export class ValidPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments): boolean {
    if (!password) {
      return false;
    }

    const options: PasswordValidationOptions = {
      ...DEFAULT_PASSWORD_OPTIONS,
      ...(args.constraints[0] || {}),
    };

    // Check length
    if (password.length < options.minLength!) {
      return false;
    }
    if (password.length > options.maxLength!) {
      return false;
    }

    // Check uppercase
    if (options.requireUppercase && !/[A-Z]/.test(password)) {
      return false;
    }

    // Check lowercase
    if (options.requireLowercase && !/[a-z]/.test(password)) {
      return false;
    }

    // Check number
    if (options.requireNumber && !/[0-9]/.test(password)) {
      return false;
    }

    // Check special character
    if (options.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const options: PasswordValidationOptions = {
      ...DEFAULT_PASSWORD_OPTIONS,
      ...(args.constraints[0] || {}),
    };

    const requirements: string[] = [];
    
    if (options.minLength) {
      requirements.push(`at least ${options.minLength} characters`);
    }
    if (options.requireUppercase) {
      requirements.push('one uppercase letter');
    }
    if (options.requireLowercase) {
      requirements.push('one lowercase letter');
    }
    if (options.requireNumber) {
      requirements.push('one number');
    }
    if (options.requireSpecialChar) {
      requirements.push('one special character');
    }

    return `Password must contain ${requirements.join(', ')}`;
  }
}

/**
 * ValidPassword Decorator
 * 
 * Custom decorator for validating password strength.
 * Can be used on DTO fields to enforce password complexity requirements.
 * 
 * @example
 * // Default requirements (8 chars, uppercase, lowercase, number, special char)
 * @ValidPassword()
 * password: string;
 * 
 * @example
 * // Custom requirements
 * @ValidPassword({ minLength: 12, requireSpecialChar: false })
 * password: string;
 * 
 * @param options - Password validation options
 * @param validationOptions - Additional class-validator options
 */
export function ValidPassword(
  options?: PasswordValidationOptions,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [options],
      validator: ValidPasswordConstraint,
    });
  };
}
