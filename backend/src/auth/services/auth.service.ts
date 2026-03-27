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
import { AuditLogService } from '../../common/services/audit-log.service';
import { toAppUser, mapToUserResponse } from '../../common/mappers/user.mapper';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { LoginAction } from '../../users/enums/login-action.enum';
import { User } from '../../users/entities/user.entity';
import {
  BCRYPT_ROUNDS,
  EMAIL_VERIFICATION_EXPIRY_MS,
} from '../../common/constants/auth.constants';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { LoginAttemptService } from './login-attempt.service';
import { DeviceService } from './device.service';
import { OAuthProfile } from '../strategies/google.strategy';
import { UserResponse } from '../dto/auth-response.dto';
import {
  BadCredentialsException,
  EmailNotVerifiedException,
  AccountLockedException,
} from '../../common/exceptions';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly deviceService: DeviceService,
    private readonly mfaService: MfaService,
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordService: PasswordService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // â”€â”€â”€ Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async register(dto: RegisterDto, req: Request) {
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');
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
          // Giá»¯ tÆ°Æ¡ng thÃ­ch: lÆ°u inline token cÅ© + táº¡o verification_tokens record má»›i
          email_verification_token: verificationTokenHash,
          email_verification_expiry: verificationExpiry,
        },
        include: { user_roles: { include: { roles: true } } },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Email already in use');
      throw e;
    }

    // Táº¡o verification_tokens record (cÃ¡ch má»›i)
    await this.prisma.verification_tokens.create({
      data: {
        user_id: user.id,
        token_hash: verificationTokenHash,
        type: 'EMAIL_VERIFICATION',
        expires_at: verificationExpiry,
      },
    });

    const appUser = toAppUser(user);
    this.emailService
      .sendVerificationEmail(appUser.email, appUser.firstName, verificationToken)
      .catch(e => this.logger.warn(`Verification email failed: ${e.message}`));
    this.emailService
      .sendWelcomeEmail(appUser.email, appUser.firstName)
      .catch(e => this.logger.warn(`Welcome email failed: ${e.message}`));

    // KhÃ´ng issue tokens khi register (pháº£i verify email trÆ°á»›c)
    return { message: 'Registration successful. Please verify your email.' };
  }

  // â”€â”€â”€ Email Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async verifyEmail(token: string) {
    return this.emailVerificationService.verifyEmail(token);
  }

  async resendVerificationEmail(email: string) {
    return this.emailVerificationService.resendVerificationEmail(email);
  }

  // â”€â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async login(dto: LoginDto, req: Request) {
    const { ip } = extractRequestContext(req);
    const { email, password, deviceId, deviceName, deviceType, rememberMe } = dto;

    // 1. Brute force check (Redis)
    await this.loginAttemptService.checkBruteForce(email, ip);

    // 2. TÃ¬m user
    const userRecord = await this.prisma.users.findFirst({
      where: { email, is_deleted: false },
      include: { user_roles: { include: { roles: true } } },
    });
    if (!userRecord) {
      await this.loginAttemptService.recordFailedLogin(email, ip, undefined, 'User not found');
      throw new BadCredentialsException();
    }
    const user = toAppUser(userRecord);

    // 3. Verify password
    const isValid = await bcrypt.compare(password, user.password ?? '');
    if (!isValid) {
      await this.loginAttemptService.recordFailedLogin(email, ip, user.id, 'Wrong password');
      throw new BadCredentialsException();
    }

    // 4. Kiá»ƒm tra account status
    if (!user.emailVerified) throw new EmailNotVerifiedException();
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');
    if (user.isLocked) throw new AccountLockedException();

    // 5. MFA check
    if (user.twoFactorEnabled) {
      // Kiá»ƒm tra device trusted
      const isTrusted = deviceId
        ? await this.deviceService.isDeviceTrusted(user.id, deviceId)
        : false;

      if (!isTrusted) {
        // Issue MFA pending JWT (5 phÃºt)
        const mfaToken = this.tokenService.generateMfaToken(user.id);
        return { mfaRequired: true, mfaToken };
      }
    }

    // 6. ÄÄƒng kÃ½ device + issue tokens
    const device = await this.deviceService.registerDevice(
      user.id,
      req,
      deviceId,
      deviceName,
      deviceType,
    );

    const roles = userRecord.user_roles.map((ur: any) => ur.roles.name);
    const tokenUser = { id: user.id, email: user.email, roles };

    const accessToken = this.tokenService.generateAccessToken(tokenUser, device.device_id);
    const { token: refreshToken, jti, ttlSec } = this.tokenService.generateRefreshToken(
      tokenUser,
      device.device_id,
      rememberMe ?? false,
    );
    await this.tokenService.storeRefreshToken(user.id, device.device_id, jti, ttlSec);

    // 7. Update DB + ghi lá»‹ch sá»­
    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });
    await this.loginAttemptService.recordSuccessfulLogin(email, ip, user.id);
    await this.auditLogService.recordAuditLog(user.id, 'LOGIN', ip);

    return this.buildAuthResponse(accessToken, refreshToken, user, roles);
  }

  // â”€â”€â”€ MFA Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async validateMfaLogin(
    mfaToken: string,
    totpCode: string,
    req: Request,
    deviceId?: string,
    deviceName?: string,
    deviceType?: string,
  ) {
    const { ip } = extractRequestContext(req);

    // Verify MFA JWT
    const decoded = this.tokenService.decodeMfaToken(mfaToken);
    if (!decoded) throw new UnauthorizedException('MFA session expired or invalid');

    const userRecord = await this.prisma.users.findFirst({
      where: { id: decoded.userId, is_deleted: false },
      include: { user_roles: { include: { roles: true } } },
    });
    if (!userRecord) throw new UnauthorizedException('User not found');

    const user = toAppUser(userRecord);

    // Verify TOTP / backup code
    const isValid = await this.mfaService.verifyCodeOrBackup(user, totpCode);
    if (!isValid) throw new UnauthorizedException('Invalid MFA code');

    // ÄÄƒng kÃ½ device + issue tokens
    const device = await this.deviceService.registerDevice(
      user.id,
      req,
      deviceId,
      deviceName,
      deviceType,
    );

    const roles = userRecord.user_roles.map((ur: any) => ur.roles.name);
    const tokenUser = { id: user.id, email: user.email, roles };

    const accessToken = this.tokenService.generateAccessToken(tokenUser, device.device_id);
    const { token: refreshToken, jti, ttlSec } = this.tokenService.generateRefreshToken(
      tokenUser,
      device.device_id,
    );
    await this.tokenService.storeRefreshToken(user.id, device.device_id, jti, ttlSec);

    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });
    await this.auditLogService.recordAuditLog(user.id, 'MFA_LOGIN', ip);

    return this.buildAuthResponse(accessToken, refreshToken, user, roles);
  }

  // â”€â”€â”€ Token Refresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async refreshToken(token: string, _req: Request) {
    const payload = await this.tokenService.validateRefreshToken(token);
    if (!payload) throw new UnauthorizedException('Refresh token invalid or expired');

    const userRecord = await this.prisma.users.findFirst({
      where: { id: payload.userId, is_deleted: false, is_active: true },
      include: { user_roles: { include: { roles: true } } },
    });
    if (!userRecord) throw new UnauthorizedException('User not found');

    const user = toAppUser(userRecord);
    const roles = userRecord.user_roles.map((ur: any) => ur.roles.name);
    const tokenUser = { id: user.id, email: user.email, roles };

    // Blacklist token cÅ©
    await this.tokenService.blacklistToken(token);

    // Issue token má»›i
    const newAccess = this.tokenService.generateAccessToken(tokenUser, payload.deviceId);
    const { token: newRefresh, jti, ttlSec } = this.tokenService.generateRefreshToken(
      tokenUser,
      payload.deviceId,
    );
    await this.tokenService.storeRefreshToken(user.id, payload.deviceId, jti, ttlSec);

    return this.buildAuthResponse(newAccess, newRefresh, user, roles);
  }

  // â”€â”€â”€ Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async logout(accessToken: string, refreshToken: string, user: User, req: Request) {
    const { ip } = extractRequestContext(req);
    // Blacklist access token
    await this.tokenService.blacklistToken(accessToken);
    // Decode refresh token Ä‘á»ƒ láº¥y deviceId
    try {
      const payload = await this.tokenService.validateRefreshToken(refreshToken);
      if (payload) {
        await this.tokenService.revokeDeviceSession(user.id, payload.deviceId);
      }
    } catch {
      // Refresh token khÃ´ng há»£p lá»‡ â†’ bá» qua
    }
    await this.auditLogService.recordAuditLog(user.id, 'LOGOUT', ip);
  }

  async logoutAll(accessToken: string, user: User, req: Request) {
    const { ip } = extractRequestContext(req);
    await this.tokenService.blacklistToken(accessToken);
    await this.tokenService.revokeAllSessions(user.id);
    await this.auditLogService.recordAuditLog(user.id, 'LOGOUT_ALL', ip);
  }

  async logoutSession(accessToken: string, deviceId: string, user: User, req: Request) {
    const { ip } = extractRequestContext(req);
    await this.tokenService.revokeDeviceSession(user.id, deviceId);
    await this.auditLogService.recordAuditLog(user.id, 'LOGOUT_SESSION', ip);
  }

  // â”€â”€â”€ Password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async forgotPassword(dto: { email: string }) {
    return this.passwordService.forgotPassword(dto);
  }

  async resetPassword(dto: { token: string; newPassword: string }) {
    return this.passwordService.resetPassword(dto);
  }

  async changePassword(
    dto: { currentPassword: string; newPassword: string; logoutAllDevices?: boolean },
    user: User,
    req: Request,
  ) {
    return this.passwordService.changePassword(dto, user, req);
  }

  // â”€â”€â”€ MFA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async setupMfa(user: User) {
    return this.mfaService.setupMfa(user);
  }

  async verifyAndEnableMfa(dto: { code: string }, user: User, req: Request) {
    return this.mfaService.verifyAndEnableMfa(dto, user, req);
  }

  async disableMfa(dto: { code: string }, user: User, req: Request) {
    return this.mfaService.disableMfa(dto, user, req);
  }

  // â”€â”€â”€ Account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async deleteAccount(user: User, accessToken: string, req: Request) {
    return this.sessionService.deleteAccount(user, accessToken, req);
  }

  async cancelDeleteAccount(user: User) {
    return this.sessionService.cancelDeleteAccount(user);
  }

  // â”€â”€â”€ OAuth2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async handleOAuthLogin(profile: OAuthProfile, req: Request) {
    const { ip } = extractRequestContext(req);

    // TÃ¬m hoáº·c táº¡o oauth_accounts record
    let oauthAccount = await this.prisma.oauth_accounts.findUnique({
      where: {
        provider_provider_user_id: {
          provider: profile.provider as string,
          provider_user_id: profile.providerId,
        },
      },
      include: { users: { include: { user_roles: { include: { roles: true } } } } },
    });

    let userRecord: any;

    if (!oauthAccount) {
      // TÃ¬m user theo email
      userRecord = await this.prisma.users.findUnique({ where: { email: profile.email } });

      if (!userRecord) {
        // Táº¡o user má»›i
        userRecord = await this.prisma.users.create({
          data: {
            email: profile.email,
            first_name: profile.firstName,
            last_name: profile.lastName,
            avatar_url: profile.avatarUrl,
            provider: profile.provider as AuthProvider,
            provider_id: profile.providerId,
            email_verified: true,
            email_verified_at: new Date(),
          },
          include: { user_roles: { include: { roles: true } } },
        });
      } else if (userRecord.provider !== 'LOCAL') {
        // Email Ä‘Ã£ tá»“n táº¡i vá»›i password â†’ khÃ´ng cho phÃ©p link tá»± Ä‘á»™ng
        throw new ConflictException(
          'An account with this email exists. Please login with password and link your social account.',
        );
      }

      // Táº¡o oauth_accounts record
      await this.prisma.oauth_accounts.create({
        data: {
          user_id: userRecord.id,
          provider: profile.provider as string,
          provider_user_id: profile.providerId,
          email: profile.email,
          name: `${profile.firstName} ${profile.lastName}`,
          image_url: profile.avatarUrl,
        },
      });

      // Load láº¡i vá»›i relations
      userRecord = await this.prisma.users.findUnique({
        where: { id: userRecord.id },
        include: { user_roles: { include: { roles: true } } },
      });
    } else {
      userRecord = oauthAccount.users;
    }

    if (!userRecord.is_active || userRecord.is_deleted) {
      throw new UnauthorizedException('Account is disabled or deleted');
    }

    const user = toAppUser(userRecord);
    const roles = (userRecord as any).user_roles.map((ur: any) => ur.roles.name);
    const tokenUser = { id: user.id, email: user.email, roles };

    const device = await this.deviceService.registerDevice(user.id, req);
    const accessToken = this.tokenService.generateAccessToken(tokenUser, device.device_id);
    const { token: refreshToken, jti, ttlSec } = this.tokenService.generateRefreshToken(
      tokenUser,
      device.device_id,
    );
    await this.tokenService.storeRefreshToken(user.id, device.device_id, jti, ttlSec);

    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });
    await this.auditLogService.recordAuditLog(user.id, 'OAUTH_LOGIN', ip);

    return this.buildAuthResponse(accessToken, refreshToken, user, roles);
  }

  // â”€â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private buildAuthResponse(
    accessToken: string,
    refreshToken: string,
    user: User,
    roles: string[],
  ) {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.avatarUrl,
        roles,
        mfaEnabled: user.twoFactorEnabled,
        emailVerified: user.emailVerified,
      },
    };
  }

  mapToUserResponse(user: any): UserResponse {
    return mapToUserResponse(user);
  }
}
