import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '../../users/entities/user.entity';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: { sub: string; email: string }) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) throw new UnauthorizedException('Token has been revoked');

    const user = await this.prisma.users.findFirst({
      where: { id: payload.sub, is_deleted: false },
      include: {
        user_roles: {
          include: {
            roles: true,
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const appUser = {
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
      accessToken: token,
    };

    return appUser as User & { accessToken: string };
  }
}
