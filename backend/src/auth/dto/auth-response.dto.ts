// ─── Auth-specific DTOs ─────────────────────────────────────────────────

import { UserResponse } from '../../users/dto/user-response.dto';

export interface AuthResponse {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  user?: UserResponse;
  mfaRequired?: boolean;
  mfaTempToken?: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
}

// ─── Re-exports for backward compatibility ──────────────────────────────
// All consumers that import from here will continue to work.

export {
  UserResponse,
  UserSessionResponse,
  LoginHistoryResponse,
  NotificationPreferencesResponse,
  PrivacySettingsResponse,
  DeviceFingerprintResponse,
} from '../../users/dto/user-response.dto';
export { NotificationResponse } from '../../notifications/dto/notification-response.dto';
export { PageResponse } from '../../common/utils/pagination.util';
