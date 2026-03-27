import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
// otplib v13: require plugins explicitly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const otplib = require('otplib') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateTOTP } = require('@otplib/uri') as any;
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { LoginAction } from '../../users/enums/login-action.enum';
import { User } from '../../users/entities/user.entity';

export interface MfaSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

@Injectable()
export class MfaService {
  /** 32-byte key derived from JWT_SECRET via SHA-256 */
  private readonly encKey: Buffer;
  /** Reusable plugin refs for creating TOTP instances */
  private readonly cryptoPlugin: any;
  private readonly base32Plugin: any;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.encKey = crypto
      .createHash('sha256')
      .update(config.get<string>('JWT_SECRET', 'default-secret'))
      .digest();
    // otplib v13 requires explicit crypto and base32 plugins
    this.cryptoPlugin = new otplib.NobleCryptoPlugin();
    this.base32Plugin = new otplib.ScureBase32Plugin();
  }

  /** Create a TOTP instance bound to a specific secret */
  private createTotp(secret: string): any {
    return new otplib.TOTP({ secret, crypto: this.cryptoPlugin, base32: this.base32Plugin });
  }

  // ─── Setup MFA ─────────────────────────────────────────────────────────────

  /**
   * Tạo secret + QR code + backup codes.
   * Lưu vào bảng mfa_secrets (chưa enabled, chưa verified).
   */
  async setupMfa(user: User): Promise<MfaSetupResult> {
    if (user.twoFactorEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = otplib.generateSecret();
    const encrypted = this.encrypt(secret);

    const backupCodes = this.generateRawBackupCodes();
    const hashedCodes = backupCodes.map(c =>
      crypto.createHash('sha256').update(c).digest('hex'),
    );

    // Upsert vào mfa_secrets
    await this.prisma.mfa_secrets.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        secret_encrypted: encrypted,
        enabled: false,
        verified: false,
        backup_codes: JSON.stringify(hashedCodes),
      },
      update: {
        secret_encrypted: encrypted,
        enabled: false,
        verified: false,
        backup_codes: JSON.stringify(hashedCodes),
      },
    });

    // Tạo QR code
    const issuer = this.config.get<string>('MFA_ISSUER', 'TicketApp');
    const otpAuthUri = generateTOTP({ label: user.email, secret, issuer });
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUri);

    return { secret, qrCodeUrl, backupCodes };
  }

  // ─── Confirm Setup ─────────────────────────────────────────────────────────

  /**
   * Confirm MFA setup bằng TOTP code.
   * Bật mfa_enabled trên user.
   */
  async verifyAndEnableMfa(
    dto: { code: string },
    user: User,
    req: Request,
  ): Promise<{ message: string }> {
    const mfaSecret = await this.prisma.mfa_secrets.findUnique({
      where: { user_id: user.id },
    });
    if (!mfaSecret) throw new BadRequestException('MFA setup not started');

    const secret = this.decrypt(mfaSecret.secret_encrypted);
    const result = await this.createTotp(secret).verify(dto.code);
    const isValid = result?.valid ?? false;
    if (!isValid) throw new BadRequestException('Invalid MFA code');

    // Đánh dấu verified + enabled
    await this.prisma.mfa_secrets.update({
      where: { user_id: user.id },
      data: { verified: true, enabled: true, verified_at: new Date() },
    });
    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_enabled: true },
    });

    const ctx = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(user, LoginAction.MFA_ENABLED, ctx, true);
    return { message: 'Two-factor authentication enabled' };
  }

  // ─── Verify code (dùng khi login) ─────────────────────────────────────────

  /**
   * Xác thực TOTP code hoặc backup code.
   * Backup code: thử so sánh SHA-256 hash rồi xóa khỏi danh sách.
   */
  async verifyCodeOrBackup(user: User, code: string): Promise<boolean> {
    const mfaSecret = await this.prisma.mfa_secrets.findUnique({
      where: { user_id: user.id },
    });
    if (!mfaSecret) return false;

    const secret = this.decrypt(mfaSecret.secret_encrypted);

    // Thử TOTP trước
    const totpResult = await this.createTotp(secret).verify(code);
    if (totpResult?.valid) return true;

    // Fallback: backup code
    if (mfaSecret.backup_codes) {
      const codes: string[] = JSON.parse(mfaSecret.backup_codes);
      const hashed = crypto.createHash('sha256').update(code).digest('hex');
      const idx = codes.indexOf(hashed);
      if (idx !== -1) {
        codes.splice(idx, 1);
        await this.prisma.mfa_secrets.update({
          where: { user_id: user.id },
          data: { backup_codes: JSON.stringify(codes) },
        });
        return true;
      }
    }
    return false;
  }

  // ─── Disable MFA ───────────────────────────────────────────────────────────

  async disableMfa(dto: { code: string }, user: User, req: Request): Promise<{ message: string }> {
    if (!user.twoFactorEnabled) throw new BadRequestException('MFA is not enabled');

    const valid = await this.verifyCodeOrBackup(user, dto.code);
    if (!valid) throw new BadRequestException('Invalid MFA code');

    await this.prisma.mfa_secrets.delete({ where: { user_id: user.id } });
    await this.prisma.users.update({
      where: { id: user.id },
      data: { two_factor_enabled: false, two_factor_secret: null, mfa_backup_codes: [] },
    });

    const ctx = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(user, LoginAction.MFA_DISABLED, ctx, true);
    return { message: 'Two-factor authentication disabled' };
  }

  // ─── Regenerate Backup Codes ───────────────────────────────────────────────

  async regenerateBackupCodes(userId: string, totpCode: string): Promise<{ backupCodes: string[] }> {
    const mfaSecret = await this.prisma.mfa_secrets.findUnique({ where: { user_id: userId } });
    if (!mfaSecret) throw new BadRequestException('MFA is not enabled');

    const secret = this.decrypt(mfaSecret.secret_encrypted);
    const regenResult = await this.createTotp(secret).verify(totpCode);
    if (!regenResult?.valid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    const backupCodes = this.generateRawBackupCodes();
    const hashedCodes = backupCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));

    await this.prisma.mfa_secrets.update({
      where: { user_id: userId },
      data: { backup_codes: JSON.stringify(hashedCodes) },
    });

    return { backupCodes };
  }

  async getBackupCodesCount(userId: string): Promise<{ remaining: number }> {
    const mfaSecret = await this.prisma.mfa_secrets.findUnique({ where: { user_id: userId } });
    if (!mfaSecret?.backup_codes) return { remaining: 0 };
    const codes: string[] = JSON.parse(mfaSecret.backup_codes);
    return { remaining: codes.length };
  }

  async getMfaStatus(userId: string): Promise<{ enabled: boolean }> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { two_factor_enabled: true },
    });
    return { enabled: user?.two_factor_enabled ?? false };
  }

  // ─── AES-256-GCM Encryption ────────────────────────────────────────────────

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(data: string): string {
    const [ivHex, authTagHex, encHex] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private generateRawBackupCodes(count = 10): string[] {
    // 4-byte hex = 8 ký tự, dễ nhớ
    return Array.from({ length: count }, () => crypto.randomBytes(4).toString('hex'));
  }
}

