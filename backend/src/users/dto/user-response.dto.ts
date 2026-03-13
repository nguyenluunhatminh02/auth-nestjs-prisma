export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: Date;
  gender?: string;
  role: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  language: string;
  timezone: string;
  lastLoginAt?: Date;
  createdAt: Date;
}

export interface UserSessionResponse {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  current: boolean;
}

export interface LoginHistoryResponse {
  id: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
  success: boolean;
  failureReason?: string;
  createdAt: Date;
}

export interface NotificationPreferencesResponse {
  notificationEmailEnabled: boolean;
  notificationPushEnabled: boolean;
  notificationInAppEnabled: boolean;
  notificationSecurityEnabled: boolean;
  notificationOrderEnabled: boolean;
  notificationPromotionEnabled: boolean;
}

export interface PrivacySettingsResponse {
  profilePublic: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showActivityStatus: boolean;
}

export interface DeviceFingerprintResponse {
  id: string;
  fingerprint: string;
  deviceName?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  isTrusted: boolean;
  lastSeenAt?: Date;
  createdAt: Date;
}
