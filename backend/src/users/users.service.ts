import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import {
  UserSessionResponse,
  LoginHistoryResponse,
  NotificationPreferencesResponse,
  PrivacySettingsResponse,
  DeviceFingerprintResponse,
} from '../auth/dto/auth-response.dto';
import { PageResponse, buildPageResponse } from '../common/utils/pagination.util';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ── Profile ────────────────────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      dateOfBirth?: Date;
      gender?: string;
      language?: string;
      timezone?: string;
    },
  ): Promise<User> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: {
        first_name: dto.firstName,
        last_name: dto.lastName,
        phone: dto.phone,
        date_of_birth: dto.dateOfBirth,
        gender: dto.gender,
        language: dto.language,
        timezone: dto.timezone,
      },
      include: {
        user_roles: { include: { roles: true } },
      },
    });

    return this.toAppUser(updated);
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: { avatar_url: avatarUrl },
      include: {
        user_roles: { include: { roles: true } },
      },
    });

    return this.toAppUser(updated);
  }

  // ── Notification preferences ──────────────────────────────────────────────────

  async getNotificationPreferences(userId: string): Promise<NotificationPreferencesResponse> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      notificationEmailEnabled: user.notification_email_enabled,
      notificationPushEnabled: user.notification_push_enabled,
      notificationInAppEnabled: user.notification_in_app_enabled,
      notificationSecurityEnabled: user.notification_security_enabled,
      notificationOrderEnabled: user.notification_order_enabled,
      notificationPromotionEnabled: user.notification_promotion_enabled,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: Partial<{
      notificationEmailEnabled: boolean;
      notificationPushEnabled: boolean;
      notificationInAppEnabled: boolean;
      notificationSecurityEnabled: boolean;
      notificationOrderEnabled: boolean;
      notificationPromotionEnabled: boolean;
    }>,
  ): Promise<NotificationPreferencesResponse> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        notification_email_enabled: dto.notificationEmailEnabled,
        notification_push_enabled: dto.notificationPushEnabled,
        notification_in_app_enabled: dto.notificationInAppEnabled,
        notification_security_enabled: dto.notificationSecurityEnabled,
        notification_order_enabled: dto.notificationOrderEnabled,
        notification_promotion_enabled: dto.notificationPromotionEnabled,
      },
    });

    return this.getNotificationPreferences(userId);
  }

  // ── Privacy settings ──────────────────────────────────────────────────────────

  async getPrivacySettings(userId: string): Promise<PrivacySettingsResponse> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      profilePublic: user.profile_public,
      showEmail: user.show_email,
      showPhone: user.show_phone,
      showActivityStatus: user.show_activity_status,
    };
  }

  async updatePrivacySettings(
    userId: string,
    dto: Partial<{
      profilePublic: boolean;
      showEmail: boolean;
      showPhone: boolean;
      showActivityStatus: boolean;
    }>,
  ): Promise<PrivacySettingsResponse> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        profile_public: dto.profilePublic,
        show_email: dto.showEmail,
        show_phone: dto.showPhone,
        show_activity_status: dto.showActivityStatus,
      },
    });

    return this.getPrivacySettings(userId);
  }

  // ── FCM token ─────────────────────────────────────────────────────────────────

  async updateFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { fcm_token: fcmToken },
    });
  }

  // ── Device fingerprints ───────────────────────────────────────────────────────

  async getDevices(userId: string): Promise<DeviceFingerprintResponse[]> {
    const devices = await this.prisma.device_fingerprints.findMany({
      where: { user_id: userId },
      orderBy: { last_seen_at: 'desc' },
    });
    return devices.map((d) => ({
      id: d.id,
      fingerprint: d.fingerprint,
      deviceName: d.device_name ?? null,
      browser: d.browser ?? null,
      os: d.os ?? null,
      ipAddress: d.ip_address ?? null,
      isTrusted: d.is_trusted,
      lastSeenAt: d.last_seen_at ?? null,
      createdAt: d.created_at,
    }));
  }

  async trustDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device_fingerprints.findFirst({
      where: { id: deviceId, user_id: userId },
    });
    if (!device) throw new NotFoundException('Device not found');
    await this.prisma.device_fingerprints.update({
      where: { id: deviceId },
      data: { is_trusted: true },
    });
  }

  async untrustDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device_fingerprints.findFirst({
      where: { id: deviceId, user_id: userId },
    });
    if (!device) throw new NotFoundException('Device not found');
    await this.prisma.device_fingerprints.update({
      where: { id: deviceId },
      data: { is_trusted: false },
    });
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    const result = await this.prisma.device_fingerprints.deleteMany({
      where: { id: deviceId, user_id: userId },
    });
    if (!result.count) throw new NotFoundException('Device not found');
  }

  // ── Security questions ────────────────────────────────────────────────────────

  async setupSecurityQuestions(
    userId: string,
    questions: { question: string; answer: string }[],
  ): Promise<void> {
    if (!questions.length || questions.length > 3) {
      throw new BadRequestException('Provide between 1 and 3 security questions');
    }
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Replace existing questions
    await this.prisma.security_questions.deleteMany({ where: { user_id: userId } });

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const answerHash = await bcrypt.hash(q.answer.toLowerCase().trim(), 10);
      await this.prisma.security_questions.create({
        data: {
          user_id: userId,
          question: q.question,
          answer_hash: answerHash,
          sort_order: i,
        },
      });
    }
  }

  async getSecurityQuestions(userId: string): Promise<string[]> {
    const sqs = await this.prisma.security_questions.findMany({
      where: { user_id: userId },
      orderBy: { sort_order: 'asc' },
    });
    return sqs.map((s) => s.question);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  async getActiveSessions(
    userId: string,
    currentAccessToken: string,
  ): Promise<UserSessionResponse[]> {
    const sessions = await this.prisma.refresh_tokens.findMany({
      where: { user_id: userId, is_revoked: false },
      orderBy: { last_active_at: 'desc' },
    });

    let currentTokenId: string | null = null;
    try {
      const decoded = this.jwtService.decode(currentAccessToken) as any;
      currentTokenId = decoded?.jti ?? null;
    } catch {
      // ignore
    }

    return sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.device_info ?? 'Unknown',
      ipAddress: s.ip_address ?? 'Unknown',
      userAgent: s.user_agent ?? '',
      createdAt: s.created_at,
      lastActiveAt: s.last_active_at ?? s.created_at,
      current: currentTokenId ? s.id === currentTokenId : false,
    }));
  }

  // ── Login history ─────────────────────────────────────────────────────────────

  async getLoginHistory(
    userId: string,
    page: number,
    size: number,
  ): Promise<PageResponse<LoginHistoryResponse>> {
    const total = await this.prisma.login_history.count({ where: { user_id: userId } });
    const items = await this.prisma.login_history.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip: page * size,
      take: size,
    });

    return buildPageResponse(
      items,
      (h) => ({
        id: h.id,
        action: h.action,
        ipAddress: h.ip_address ?? 'Unknown',
        userAgent: h.user_agent ?? '',
        deviceInfo: h.device_info ?? 'Unknown',
        success: h.success ?? true,
        failureReason: h.failure_reason ?? null,
        createdAt: h.created_at,
      }),
      page,
      size,
      total,
    );
  }

  private toAppUser(user: any): User {
    return {
      id: user.id,
      email: user.email,
      password: user.password,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      dateOfBirth: user.date_of_birth,
      gender: user.gender,
      provider: user.provider,
      providerId: user.provider_id,
      emailVerified: user.email_verified,
      emailVerificationToken: user.email_verification_token,
      emailVerificationExpiry: user.email_verification_expiry,
      passwordResetToken: user.password_reset_token,
      passwordResetExpiry: user.password_reset_expiry,
      twoFactorEnabled: user.two_factor_enabled,
      twoFactorSecret: user.two_factor_secret,
      isActive: user.is_active,
      isLocked: user.is_locked,
      failedLoginAttempts: user.failed_login_attempts,
      lockTime: user.lock_time,
      lastLoginAt: user.last_login_at,
      lastLoginIp: user.last_login_ip,
      isDeleted: user.is_deleted,
      deletedAt: user.deleted_at,
      language: user.language,
      timezone: user.timezone,
      notificationEmailEnabled: user.notification_email_enabled,
      notificationPushEnabled: user.notification_push_enabled,
      notificationInAppEnabled: user.notification_in_app_enabled,
      notificationSecurityEnabled: user.notification_security_enabled,
      notificationOrderEnabled: user.notification_order_enabled,
      notificationPromotionEnabled: user.notification_promotion_enabled,
      profilePublic: user.profile_public,
      showEmail: user.show_email,
      showPhone: user.show_phone,
      showActivityStatus: user.show_activity_status,
      deleteStatus: user.delete_status,
      deleteRequestedAt: user.delete_requested_at,
      fcmToken: user.fcm_token,
      roles: (user.user_roles ?? []).map((x: any) => x.roles),
      refreshTokens: [],
      loginHistories: [],
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    } as User;
  }
}

