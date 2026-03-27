import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { toAppUser, mapToUserResponse } from '../../common/mappers/user.mapper';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { LoginAction } from '../../users/enums/login-action.enum';
import { User } from '../../users/entities/user.entity';
import {
  BCRYPT_ROUNDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCK_DURATION_MS,
  EMAIL_VERIFICATION_EXPIRY_MS,
  MFA_TEMP_TTL,
} from '../../common/constants/auth.constants';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { MfaLoginDto } from '../dto/mfa.dto';
import { AuthResponse } from '../dto/auth-response.dto';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { UserResponse } from '../dto/auth-response.dto';
import { OAuthProfile } from '../strategies/google.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private rtService: RefreshTokenService,
    private mfaService: MfaService,
    private tokenBlacklistService: TokenBlacklistService,
    private redis: RedisService,
    private emailService: EmailService,
    private sessionService: SessionService,
    private emailVerificationService: EmailVerificationService,
    private passwordService: PasswordService,
    private auditLogService: AuditLogService,
  ) {}

  // ─── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto, req: Request): Promise<AuthResponse> {
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const verificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    let user: any;
    try {
      user = await this.prisma.users.create({
        data: {
          first_name: dto.firstName,
          last_name: dto.lastName,
          email: dto.email,
          password: hashed,
          provider: AuthProvider.LOCAL,
          email_verification_token: verificationTokenHash,
          email_verification_expiry: verificationExpiry,
        },
        include: { user_roles: { include: { roles: true } } },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Email already in use');
      throw e;
    }
    const appUser = toAppUser(user);

    this.emailService.sendVerificationEmail(appUser.email, appUser.firstName, verificationToken)
      .catch(e => this.logger.warn(`Verification email failed: ${e.message}`));
    this.emailService.sendWelcomeEmail(appUser.email, appUser.firstName)
      .catch(e => this.logger.warn(`Welcome email failed: ${e.message}`));

    return this.sessionService.buildAuthResponse(appUser, req);
  }

  // ─── Email Verification (delegates) ─────────────────────────────────────────

  async verifyEmail(token: string) { return this.emailVerificationService.verifyEmail(token); }
  async resendVerificationEmail(email: string) { return this.emailVerificationService.resendVerificationEmail(email); }

  // ─── Login ────────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, req: Request): Promise<AuthResponse> {
    const { ip, ua, device } = extractRequestContext(req);

    const userRecord = await this.prisma.users.findFirst({
      where: { email: dto.email, is_deleted: false },
      include: { user_roles: { include: { roles: true } } },
    });
    if (!userRecord) throw new UnauthorizedException('Invalid email or password');
    const user = toAppUser(userRecord);

    if (user.isLocked && user.lockTime) {
      if (new Date().getTime() - user.lockTime.getTime() < ACCOUNT_LOCK_DURATION_MS) {
        throw new UnauthorizedException('Account is locked. Try again later.');
      }
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
          data: { failed_login_attempts: user.failedLoginAttempts, is_locked: true, lock_time: user.lockTime },
        });
        await this.auditLogService.recordLoginHistory(user, LoginAction.ACCOUNT_LOCKED, { ip, ua, device }, false, 'Account locked after 5 failed attempts');
        this.emailService.sendAccountLockedEmail(user.email, user.firstName)
          .catch(e => this.logger.warn(`Account locked email failed: ${e.message}`));
        throw new UnauthorizedException('Account locked due to too many failed login attempts. Try again in 30 minutes.');
      }
      await this.prisma.users.update({
        where: { id: user.id },
        data: { failed_login_attempts: user.failedLoginAttempts },
      });
      await this.auditLogService.recordLoginHistory(user, LoginAction.LOGIN_FAILED, { ip, ua, device }, false, 'Bad credentials');
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      await this.prisma.users.update({ where: { id: user.id }, data: { failed_login_attempts: 0 } });
    }

    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    if (user.twoFactorEnabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      await this.redis.set(`mfa_temp:${tempToken}`, user.id, MFA_TEMP_TTL);
      return { mfaRequired: true, mfaTempToken: tempToken };
    }

    await this.tokenBlacklistService.clearUserBlacklist(user.id);

    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });

    await this.auditLogService.recordLoginHistory(user, LoginAction.LOGIN_SUCCESS, { ip, ua, device }, true, null);
    return this.sessionService.buildAuthResponse(user, req);
  }

  async validateMfaLogin(dto: MfaLoginDto, req: Request): Promise<AuthResponse> {
    const userId = await this.redis.get(`mfa_temp:${dto.mfaTempToken}`);
    if (!userId) throw new UnauthorizedException('MFA session expired or invalid');

    const userRecord = await this.prisma.users.findFirst({
      where: { id: userId, is_deleted: false },
      include: { user_roles: { include: { roles: true } } },
    });
    if (!userRecord) throw new UnauthorizedException('User not found');
    const user = toAppUser(userRecord);

    if (!(await this.mfaService.verifyCodeOrBackup(user, dto.code)))
      throw new UnauthorizedException('Invalid MFA code');
    await this.redis.del(`mfa_temp:${dto.mfaTempToken}`);

    const { ip, ua, device } = extractRequestContext(req);
    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });
    await this.tokenBlacklistService.clearUserBlacklist(user.id);
    await this.auditLogService.recordLoginHistory(user, LoginAction.LOGIN_SUCCESS, { ip, ua, device }, true, null);
    return this.sessionService.buildAuthResponse(user, req);
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────────

  async refreshToken(token: string, req: Request): Promise<AuthResponse> {
    const rt = await this.rtService.findValid(token);
    if (!rt || new Date() > rt.expires_at) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }
    if (!rt.users?.is_active || rt.users?.is_deleted) {
      await this.rtService.revoke(token);
      throw new UnauthorizedException('Account is no longer active');
    }
    const newRt = await this.rtService.rotateToken(token);
    return this.sessionService.buildAuthResponseWithRefreshToken(toAppUser(rt.users), newRt);
  }

  // ─── Password (delegates) ────────────────────────────────────────────────────

  async forgotPassword(dto: { email: string }) { return this.passwordService.forgotPassword(dto); }
  async resetPassword(dto: { token: string; newPassword: string }) { return this.passwordService.resetPassword(dto); }
  async changePassword(dto: { currentPassword: string; newPassword: string }, user: User, req: Request) {
    return this.passwordService.changePassword(dto, user, req);
  }

  // ─── MFA (delegates) ────────────────────────────────────────────────────────

  async setupMfa(user: User) { return this.mfaService.setupMfa(user); }
  async verifyAndEnableMfa(dto: { code: string }, user: User, req: Request) {
    return this.mfaService.verifyAndEnableMfa(dto, user, req);
  }
  async disableMfa(dto: { code: string }, user: User, req: Request) {
    return this.mfaService.disableMfa(dto, user, req);
  }

  // ─── Sessions (delegates) ────────────────────────────────────────────────────

  async logout(accessToken: string, refreshToken: string, user: User, req: Request) {
    return this.sessionService.logout(accessToken, refreshToken, user, req);
  }
  async logoutAll(accessToken: string, user: User, req: Request) {
    return this.sessionService.logoutAll(accessToken, user, req);
  }
  async logoutSession(accessToken: string, sessionId: string, user: User, req: Request) {
    return this.sessionService.logoutSession(accessToken, sessionId, user, req);
  }

  // ─── Account (delegates) ────────────────────────────────────────────────────

  async deleteAccount(user: User, accessToken: string, req: Request) {
    return this.sessionService.deleteAccount(user, accessToken, req);
  }
  async cancelDeleteAccount(user: User) {
    return this.sessionService.cancelDeleteAccount(user);
  }

  // ─── OAuth2 ───────────────────────────────────────────────────────────────────

  async handleOAuthLogin(profile: OAuthProfile, req: Request): Promise<AuthResponse> {
    let user = await this.prisma.users.findUnique({
      where: { email: profile.email },
      include: { user_roles: { include: { roles: true } } },
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
        include: { user_roles: { include: { roles: true } } },
      });
    } else if (!user.provider_id) {
      throw new ConflictException(
        'An account with this email already exists. Please log in with your password and link your social account from your profile settings.',
      );
    }

    if (!user.is_active || user.is_deleted)
      throw new UnauthorizedException('Account is disabled or has been deleted');

    const appUser = toAppUser(user);
    const { ip, ua, device } = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(appUser, LoginAction.LOGIN_SUCCESS, { ip, ua, device }, true, null);
    return this.sessionService.buildAuthResponse(appUser, req);
  }

  // ─── Public mapper (thin wrapper for backward compat) ────────────────────────

  mapToUserResponse(user: any): UserResponse {
    return mapToUserResponse(user);
  }
}
