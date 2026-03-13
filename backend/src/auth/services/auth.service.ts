import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../../users/entities/user.entity';
import { DeleteStatus } from '../../users/enums/delete-status.enum';
import { LoginHistory } from '../../users/entities/login-history.entity';
import { LoginAction } from '../../users/enums/login-action.enum';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { MfaLoginDto, MfaVerifyDto } from '../dto/mfa.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from '../dto/password.dto';
import { AuthResponse, MfaSetupResponse, UserResponse } from '../dto/auth-response.dto';
import { RefreshTokenService } from './refresh-token.service';
import { MfaService } from './mfa.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { RedisService } from '../../common/services/redis.service';
import { EmailService } from '../../email/email.service';
import { OAuthProfile } from '../strategies/google.strategy';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BCRYPT_ROUNDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCK_DURATION_MS,
  EMAIL_VERIFICATION_EXPIRY_MS,
  PASSWORD_RESET_EXPIRY_MS,
  MFA_TEMP_TTL,
} from '../../common/constants/auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private rtService: RefreshTokenService,
    private mfaService: MfaService,
    private tokenBlacklistService: TokenBlacklistService,
    private redis: RedisService,
    private emailService: EmailService,
  ) {}

  // ─── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto, req: Request): Promise<AuthResponse> {
    const existing = await this.prisma.users.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    const user = await this.prisma.users.create({
      data: {
      first_name: dto.firstName,
      last_name: dto.lastName,
      email: dto.email,
      password: hashed,
      provider: AuthProvider.LOCAL,
      email_verification_token: verificationToken,
      email_verification_expiry: verificationExpiry,
      },
      include: {
        user_roles: { include: { roles: true } },
      },
    });
    const appUser = this.toAppUser(user);

    // Send emails asynchronously (don't block response)
    this.emailService.sendVerificationEmail(appUser.email, appUser.firstName, verificationToken)
      .catch(e => this.logger.warn(`Verification email failed: ${e.message}`));
    this.emailService.sendWelcomeEmail(appUser.email, appUser.firstName)
      .catch(e => this.logger.warn(`Welcome email failed: ${e.message}`));

    return this.buildAuthResponse(appUser, req);
  }

  // ─── Email Verification ───────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.prisma.users.findFirst({
      where: { email_verification_token: token },
    });
    if (!user) throw new BadRequestException('Invalid verification token');
    if (!user.email_verification_expiry || new Date() > user.email_verification_expiry)
      throw new BadRequestException('Verification token expired');

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verification_token: null,
        email_verification_expiry: null,
      },
    });
    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) return { message: 'If that email exists, a verification link was sent.' };
    if (user.email_verified) throw new BadRequestException('Email already verified');

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        email_verification_token: token,
        email_verification_expiry: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS),
      },
    });
    await this.emailService.sendVerificationEmail(user.email, user.first_name, token);
    return { message: 'Verification email sent.' };
  }

  // ─── Login ────────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, req: Request): Promise<AuthResponse> {
    const { ip, ua, device } = this.extractRequestContext(req);

    const userRecord = await this.prisma.users.findFirst({
      where: { email: dto.email, is_deleted: false },
      include: {
        user_roles: { include: { roles: true } },
      },
    });
    if (!userRecord) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = this.toAppUser(userRecord);

    // Check if account is locked
    if (user.isLocked && user.lockTime) {
      if (new Date().getTime() - user.lockTime.getTime() < ACCOUNT_LOCK_DURATION_MS) {
        throw new UnauthorizedException('Account is locked. Try again later.');
      }
      // Lock period expired — unlock
      user.isLocked = false;
      user.failedLoginAttempts = 0;
      user.lockTime = null;
      await this.prisma.users.update({
        where: { id: user.id },
        data: { is_locked: false, failed_login_attempts: 0, lock_time: null },
      });
      user.isLocked = false;
      user.failedLoginAttempts = 0;
      user.lockTime = null;
    }

    if (!(await bcrypt.compare(dto.password, user.password ?? ''))) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.isLocked = true;
        user.lockTime = new Date();
        await this.prisma.users.update({
          where: { id: user.id },
          data: {
            failed_login_attempts: user.failedLoginAttempts,
            is_locked: user.isLocked,
            lock_time: user.lockTime,
          },
        });
        await this.recordHistory(user, LoginAction.ACCOUNT_LOCKED, ip, ua, device, false, 'Account locked after 5 failed attempts');
        this.emailService.sendAccountLockedEmail(user.email, user.firstName)
          .catch(e => this.logger.warn(`Account locked email failed: ${e.message}`));
        throw new UnauthorizedException('Account locked due to too many failed login attempts. Try again in 30 minutes.');
      }
      await this.prisma.users.update({
        where: { id: user.id },
        data: { failed_login_attempts: user.failedLoginAttempts },
      });
      await this.recordHistory(user, LoginAction.LOGIN_FAILED, ip, ua, device, false, 'Bad credentials');
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset failed attempts on successful auth
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      await this.prisma.users.update({
        where: { id: user.id },
        data: { failed_login_attempts: 0 },
      });
      user.failedLoginAttempts = 0;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    if (user.twoFactorEnabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      await this.redis.set(`mfa_temp:${tempToken}`, user.id, MFA_TEMP_TTL);
      return { mfaRequired: true, mfaTempToken: tempToken };
    }

    // Update last login info
    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        last_login_at: user.lastLoginAt,
        last_login_ip: user.lastLoginIp,
      },
    });

    await this.recordHistory(user, LoginAction.LOGIN_SUCCESS, ip, ua, device, true, null);
    return this.buildAuthResponse(user, req);
  }

  async validateMfaLogin(dto: MfaLoginDto, req: Request): Promise<AuthResponse> {
    const userId = await this.redis.get(`mfa_temp:${dto.mfaTempToken}`);
    if (!userId) throw new UnauthorizedException('MFA session expired or invalid');

    const userRecord = await this.prisma.users.findFirst({
      where: { id: userId, is_deleted: false },
      include: {
        user_roles: { include: { roles: true } },
      },
    });
    if (!userRecord) throw new UnauthorizedException('User not found');
    const user = this.toAppUser(userRecord);

    if (!(await this.mfaService.verifyCode(user.twoFactorSecret, dto.code))) {
      throw new UnauthorizedException('Invalid MFA code');
    }
    await this.redis.del(`mfa_temp:${dto.mfaTempToken}`);

    const { ip, ua, device } = this.extractRequestContext(req);
    await this.recordHistory(user, LoginAction.LOGIN_SUCCESS, ip, ua, device, true, null);
    return this.buildAuthResponse(user, req);
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────────

  async refreshToken(token: string, req: Request): Promise<AuthResponse> {
    const rt = await this.rtService.findValid(token);
    if (!rt || new Date() > rt.expires_at) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }
    // Ensure account is still active before issuing new tokens
    if (!rt.users?.is_active || rt.users?.is_deleted) {
      await this.rtService.revoke(token);
      throw new UnauthorizedException('Account is no longer active');
    }
    await this.rtService.revoke(token);
    await this.rtService.updateLastActive(rt.token);
    return this.buildAuthResponse(this.toAppUser(rt.users), req);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  async logout(accessToken: string, refreshToken: string, user: User, req: Request): Promise<void> {
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.rtService.revoke(refreshToken);
    const decoded = this.jwtService.decode(accessToken) as any;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await this.tokenBlacklistService.addToBlacklist(accessToken, ttl);
    }
    await this.recordHistory(user, LoginAction.LOGOUT, ip, ua, device, true, null);
  }

  async logoutAll(accessToken: string, user: User, req: Request): Promise<void> {
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.rtService.revokeAllForUser(user.id);
    const decoded = this.jwtService.decode(accessToken) as any;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await this.tokenBlacklistService.addToBlacklist(accessToken, ttl);
    }
    await this.recordHistory(user, LoginAction.LOGOUT_ALL, ip, ua, device, true, null);
  }

  async logoutSession(accessToken: string, sessionId: string, user: User, req: Request): Promise<void> {
    const revoked = await this.rtService.revokeById(sessionId, user.id);
    if (!revoked) throw new NotFoundException('Session not found');
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.recordHistory(user, LoginAction.LOGOUT_SESSION, ip, ua, device, true, null);
  }

  // ─── Password ─────────────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.users.findFirst({
      where: { email: dto.email, is_deleted: false },
    });
    if (!user) return { message: 'If that email exists, a reset link was sent.' };

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        password_reset_token: token,
        password_reset_expiry: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
      },
    });
    await this.emailService.sendPasswordResetEmail(user.email, user.first_name, token);
    return { message: 'Password reset email sent.' };
  }

  async changePassword(dto: ChangePasswordDto, user: User, req: Request): Promise<{ message: string }> {
    if (!(await bcrypt.compare(dto.currentPassword, user.password ?? '')))
      throw new BadRequestException('Current password incorrect');

    user.password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.users.update({
      where: { id: user.id },
      data: { password: user.password },
    });
    await this.rtService.revokeAllForUser(user.id);
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.recordHistory(user, LoginAction.PASSWORD_CHANGED, ip, ua, device, true, null);
    this.emailService.sendPasswordChangedEmail(user.email, user.firstName)
      .catch(e => this.logger.warn(`Password changed email failed: ${e.message}`));
    return { message: 'Password changed successfully. Please log in again.' };
  }

  // ─── MFA ─────────────────────────────────────────────────────────────────────

  async setupMfa(user: User): Promise<MfaSetupResponse> {
    if (user.twoFactorEnabled) throw new BadRequestException('MFA is already enabled');
    const secret = this.mfaService.generateSecret();
    user.twoFactorSecret = secret;
    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_secret: secret },
    });
    return this.mfaService.buildSetupResponse(user.email, secret);
  }

  async verifyAndEnableMfa(dto: MfaVerifyDto, user: User, req: Request): Promise<{ message: string }> {
    if (!user.twoFactorSecret) throw new BadRequestException('MFA setup not started');
    if (!(await this.mfaService.verifyCode(user.twoFactorSecret, dto.code)))
      throw new BadRequestException('Invalid MFA code');

    user.twoFactorEnabled = true;
    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_enabled: true },
    });
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.recordHistory(user, LoginAction.MFA_ENABLED, ip, ua, device, true, null);
    return { message: 'Two-factor authentication enabled' };
  }

  async disableMfa(dto: MfaVerifyDto, user: User, req: Request): Promise<{ message: string }> {
    if (!user.twoFactorEnabled) throw new BadRequestException('MFA is not enabled');
    if (!(await this.mfaService.verifyCode(user.twoFactorSecret, dto.code)))
      throw new BadRequestException('Invalid MFA code');

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        two_factor_enabled: false,
        two_factor_secret: null,
      },
    });
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.recordHistory(user, LoginAction.MFA_DISABLED, ip, ua, device, true, null);
    return { message: 'Two-factor authentication disabled' };
  }

  // ─── OAuth2 ───────────────────────────────────────────────────────────────────

  async handleOAuthLogin(profile: OAuthProfile, req: Request): Promise<AuthResponse> {
    let user = await this.prisma.users.findUnique({
      where: { email: profile.email },
      include: {
        user_roles: { include: { roles: true } },
      },
    });

    if (!user) {
      user = await this.prisma.users.create({
        data: {
          email: profile.email,
          first_name: profile.firstName,
          last_name: profile.lastName,
          avatar_url: profile.avatarUrl,
          provider: profile.provider as AuthProvider,
          provider_id: profile.providerId,
          email_verified: true,
        },
        include: {
          user_roles: { include: { roles: true } },
        },
      });
    } else if (!user.provider_id) {
      user = await this.prisma.users.update({
        where: { id: user.id },
        data: {
          provider: profile.provider as AuthProvider,
          provider_id: profile.providerId,
          email_verified: true,
        },
        include: {
          user_roles: { include: { roles: true } },
        },
      });
    }

    const appUser = this.toAppUser(user);
    const { ip, ua, device } = this.extractRequestContext(req);
    await this.recordHistory(appUser, LoginAction.LOGIN_SUCCESS, ip, ua, device, true, null);
    return this.buildAuthResponse(appUser, req);
  }

  // ─── Delete Account ───────────────────────────────────────────────────────────

  async deleteAccount(user: User, accessToken: string, req: Request): Promise<void> {
    const { ip, ua, device } = this.extractRequestContext(req);

    // 30-day grace period — does NOT immediately delete
    user.deleteStatus = DeleteStatus.DELETE_REQUESTED;
    user.deleteRequestedAt = new Date();
    user.isActive = false;
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        delete_status: DeleteStatus.DELETE_REQUESTED,
        delete_requested_at: user.deleteRequestedAt,
        is_active: false,
      },
    });

    await this.rtService.revokeAllForUser(user.id);
    const decoded = this.jwtService.decode(accessToken) as any;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await this.tokenBlacklistService.addToBlacklist(accessToken, ttl);
    }
    await this.recordHistory(user, LoginAction.ACCOUNT_DELETED, ip, ua, device, true, null);
  }

  async cancelDeleteAccount(user: User): Promise<void> {
    if (user.deleteStatus !== DeleteStatus.DELETE_REQUESTED) {
      throw new BadRequestException('No pending delete request');
    }
    user.deleteStatus = DeleteStatus.ACTIVE;
    user.deleteRequestedAt = null;
    user.isActive = true;
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        delete_status: DeleteStatus.ACTIVE,
        delete_requested_at: null,
        is_active: true,
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  mapToUserResponse(user: any): UserResponse {
    const roleName = user.roles?.length ? user.roles[0].name : 'ROLE_CUSTOMER';
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      dateOfBirth: user.dateOfBirth ?? null,
      gender: user.gender ?? null,
      role: roleName,
      isEmailVerified: user.emailVerified ?? false,
      isPhoneVerified: false,
      isActive: user.isActive ?? true,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      language: user.language ?? 'en',
      timezone: user.timezone ?? 'UTC',
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.users.findFirst({ where: { password_reset_token: dto.token } });
    if (!user || !user.password_reset_expiry || new Date() > user.password_reset_expiry)
      throw new BadRequestException('Invalid or expired reset token');

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: user.id },
        data: {
          password: hashed,
          password_reset_token: null,
          password_reset_expiry: null,
        },
      });
      await tx.refresh_tokens.updateMany({
        where: { user_id: user.id },
        data: { is_revoked: true },
      });
    });
    return { message: 'Password reset successful' };
  }

  private async buildAuthResponse(user: any, req: Request): Promise<AuthResponse> {
    const expiresInDays = this.config.get<number>('REFRESH_TOKEN_EXPIRATION_DAYS') ?? 7;
    const { ip, ua, device: deviceInfo } = this.extractRequestContext(req);
    const rt = await this.rtService.createRefreshToken(user, expiresInDays, deviceInfo, ip, ua);
    // Include session ID (jti) in JWT so active sessions can detect "current" session
    const payload = { sub: user.id, email: user.email, jti: rt.id };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken: rt.token,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutes in seconds
      user: this.mapToUserResponse(user),
      mfaRequired: false,
    };
  }


  private async recordHistory(
    user: any,
    action: LoginAction,
    ip: string,
    ua: string,
    device: string,
    success: boolean,
    failureReason: string | null,
  ): Promise<void> {
    await this.prisma.login_history.create({
      data: {
        user_id: user.id,
        action,
        ip_address: ip,
        user_agent: ua,
        device_info: device,
        success,
        failure_reason: failureReason ?? null,
      },
    }).catch(() => {});
  }

  private toAppUser(user: any): User {
    const roles = (user.user_roles ?? []).map((ur: any) => ur.roles).filter(Boolean);
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
      roles,
      refreshTokens: [],
      loginHistories: [],
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    } as User;
  }

  private extractRequestContext(req: Request): { ip: string; ua: string; device: string } {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
      : req.socket?.remoteAddress ?? 'unknown';
    const ua = (req.headers['user-agent'] as string) ?? '';
    return { ip, ua, device: this.parseDeviceInfo(ua) };
  }

  private parseDeviceInfo(ua: string): string {
    if (!ua) return 'Unknown';
    if (/Mobile|Android|iPhone/i.test(ua)) return 'Mobile';
    if (/Tablet|iPad/i.test(ua)) return 'Tablet';
    if (/Chrome/i.test(ua)) return 'Desktop / Chrome';
    if (/Firefox/i.test(ua)) return 'Desktop / Firefox';
    if (/Safari/i.test(ua)) return 'Desktop / Safari';
    if (/Edge/i.test(ua)) return 'Desktop / Edge';
    return 'Desktop / Other';
  }
}
