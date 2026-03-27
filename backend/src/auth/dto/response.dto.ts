import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── User Info (nhẹ, dùng trong token response) ────────────────────────────
export class UserInfoDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  roles: string[];
  mfaEnabled: boolean;
  emailVerified: boolean;
}

// ─── Auth Response ────────────────────────────────────────────────────────────
export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ default: 'Bearer' })
  tokenType: string;

  @ApiProperty({ description: 'Seconds until access token expires' })
  expiresIn: number;

  @ApiProperty({ type: UserInfoDto })
  user: UserInfoDto;

  @ApiPropertyOptional()
  mfaRequired?: boolean;

  @ApiPropertyOptional()
  mfaToken?: string;

  /** Factory: đăng nhập thành công */
  static of(accessToken: string, refreshToken: string, user: UserInfoDto): AuthResponseDto {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user,
    };
  }

  /** Factory: MFA required */
  static mfaRequired(mfaToken: string): Partial<AuthResponseDto> {
    return { mfaRequired: true, mfaToken };
  }
}

// ─── MFA Setup Response ───────────────────────────────────────────────────────
export class MfaSetupResponseDto {
  @ApiProperty({ description: 'Raw TOTP secret (dùng để nhập thủ công nếu không scan QR)' })
  secret: string;

  @ApiProperty({ description: 'QR code data URL (base64 PNG)' })
  qrCodeUrl: string;

  @ApiProperty({ description: '10 backup codes (chỉ hiện 1 lần)' })
  backupCodes: string[];
}

// ─── Device Response ──────────────────────────────────────────────────────────
export class DeviceResponseDto {
  id: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  operatingSystem?: string;
  ipAddress?: string;
  trusted: boolean;
  active: boolean;
  lastActiveAt?: Date;
  createdAt: Date;

  static from(d: any): DeviceResponseDto {
    return {
      id: d.id,
      deviceId: d.device_id,
      deviceName: d.device_name,
      deviceType: d.device_type,
      browser: d.browser ? `${d.browser} ${d.browser_version ?? ''}`.trim() : undefined,
      operatingSystem: d.operating_system
        ? `${d.operating_system} ${d.os_version ?? ''}`.trim()
        : undefined,
      ipAddress: d.ip_address,
      trusted: d.trusted,
      active: d.active,
      lastActiveAt: d.last_active_at,
      createdAt: d.created_at,
    };
  }
}

// ─── Active Sessions Response ─────────────────────────────────────────────────
export class ActiveSessionsResponseDto {
  activeCount: number;
  devices: DeviceResponseDto[];
}

// ─── API Generic Response ─────────────────────────────────────────────────────
export class ApiResponseDto<T = any> {
  success: boolean;
  message?: string;
  data?: T;

  static success<T>(data?: T, message?: string): ApiResponseDto<T> {
    return { success: true, message, data };
  }

  static error(message: string): ApiResponseDto {
    return { success: false, message };
  }
}
