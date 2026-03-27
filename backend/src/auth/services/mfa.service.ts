import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { MfaSetupResponse } from '../dto/auth-response.dto';
import { isBackupCode } from '../dto/mfa.dto';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { LoginAction } from '../../users/enums/login-action.enum';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class MfaService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  generateSecret(): string {
    return generateSecret();
  }

  generateBackupCodes(): string[] {
    return Array.from({ length: 8 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
  }

  async buildSetupResponse(email: string, secret: string): Promise<MfaSetupResponse> {
    const issuer = this.config.get<string>('mfa.issuer');
    const otpAuthUrl = generateURI({ issuer, label: email, secret });
    const qrCodeUri = await QRCode.toDataURL(otpAuthUrl);
    const backupCodes = this.generateBackupCodes();
    return { secret, qrCodeUri, backupCodes };
  }

  async verifyCode(secret: string, code: string): Promise<boolean> {
    try {
      const result = await otpVerify({ token: code, secret });
      return result.valid === true;
    } catch {
      return false;
    }
  }

  async setupMfa(user: User): Promise<MfaSetupResponse> {
    if (user.twoFactorEnabled) throw new BadRequestException('MFA is already enabled');
    const secret = this.generateSecret();
    const setupResponse = await this.buildSetupResponse(user.email, secret);
    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_secret: secret, mfa_backup_codes: setupResponse.backupCodes },
    });
    return setupResponse;
  }

  async verifyCodeOrBackup(user: User, code: string): Promise<boolean> {
    if (isBackupCode(code)) {
      const upper = code.toUpperCase();
      const stored = (user as any).mfaBackupCodes ?? [];
      if (!Array.isArray(stored) || !stored.includes(upper)) return false;
      await this.prisma.users.update({
        where: { id: user.id },
        data: { mfa_backup_codes: stored.filter((c: string) => c !== upper) },
      });
      return true;
    }
    const stored = await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { two_factor_secret: true },
    });
    return this.verifyCode(stored?.two_factor_secret ?? null, code);
  }

  async verifyAndEnableMfa(dto: { code: string }, user: User, req: Request): Promise<{ message: string }> {
    const stored = await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { two_factor_secret: true },
    });
    if (!stored?.two_factor_secret) throw new BadRequestException('MFA setup not started');
    if (!(await this.verifyCode(stored.two_factor_secret, dto.code)))
      throw new BadRequestException('Invalid MFA code');

    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_enabled: true },
    });
    const ctx = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(user, LoginAction.MFA_ENABLED, ctx, true);
    return { message: 'Two-factor authentication enabled' };
  }

  async disableMfa(dto: { code: string }, user: User, req: Request): Promise<{ message: string }> {
    if (!user.twoFactorEnabled) throw new BadRequestException('MFA is not enabled');
    const stored = await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { two_factor_secret: true },
    });
    if (!(await this.verifyCode(stored?.two_factor_secret ?? null, dto.code)))
      throw new BadRequestException('Invalid MFA code');

    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_enabled: false, two_factor_secret: null, mfa_backup_codes: [] },
    });
    const ctx = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(user, LoginAction.MFA_DISABLED, ctx, true);
    return { message: 'Two-factor authentication disabled' };
  }
}
