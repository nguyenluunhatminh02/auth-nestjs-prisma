import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Forgot Password ──────────────────────────────────────────────────────────
export class ForgotPasswordDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;
}

// ─── Reset Password ───────────────────────────────────────────────────────────
export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received in email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewP@ssw0rd!' })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ example: 'NewP@ssw0rd!' })
  @IsString()
  confirmPassword: string;
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  refreshToken: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;
}

// ─── Resend Verification ──────────────────────────────────────────────────────
export class ResendVerificationDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;
}

// ─── MFA Verify (sau khi login, khi mfaRequired=true) ────────────────────────
export class MfaVerifyDto {
  @ApiProperty({ description: 'MFA pending JWT returned from login' })
  @IsString()
  @IsNotEmpty()
  mfaToken: string;

  @ApiProperty({ description: '6-digit TOTP code or backup code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  totpCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  deviceType?: string;
}

// ─── MFA Setup Confirm ────────────────────────────────────────────────────────
export class MfaSetupConfirmDto {
  @ApiProperty({ description: '6-digit TOTP code to confirm setup' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  code: string;
}

// ─── Rename Device ────────────────────────────────────────────────────────────
export class RenameDeviceDto {
  @ApiProperty({ example: 'My MacBook' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newName: string;
}

// ─── Update Profile ───────────────────────────────────────────────────────────
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;
}
