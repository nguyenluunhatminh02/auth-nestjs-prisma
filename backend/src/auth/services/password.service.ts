import {
  Injectable, Logger, BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { PasswordHistoryService } from './password-history.service';
import { RefreshTokenService } from './refresh-token.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { BCRYPT_ROUNDS, PASSWORD_RESET_EXPIRY_MS } from '../../common/constants/auth.constants';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { LoginAction } from '../../users/enums/login-action.enum';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private passwordHistoryService: PasswordHistoryService,
    private refreshTokenService: RefreshTokenService,
    private auditLogService: AuditLogService,
  ) {}

  async forgotPassword(dto: { email: string }): Promise<{ message: string }> {
    const user = await this.prisma.users.findFirst({
      where: { email: dto.email, is_deleted: false },
    });
    if (!user) return { message: 'If that email exists, a reset link was sent.' };

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        password_reset_token: tokenHash,
        password_reset_expiry: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
      },
    });
    await this.emailService.sendPasswordResetEmail(user.email, user.first_name, token);
    return { message: 'Password reset email sent.' };
  }

  async resetPassword(dto: { token: string; newPassword: string }): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const user = await this.prisma.users.findFirst({
      where: { password_reset_token: tokenHash, is_deleted: false },
    });
    if (!user || !user.password_reset_expiry || new Date() > user.password_reset_expiry)
      throw new BadRequestException('Invalid or expired reset token');

    const isReused = await this.passwordHistoryService.isPasswordReused(user.id, dto.newPassword);
    if (isReused)
      throw new BadRequestException('Cannot reuse a previous password. Please choose a different password.');

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    if (user.password) {
      await this.passwordHistoryService.addPasswordToHistory(user.id, user.password);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: user.id },
        data: { password: hashed, password_reset_token: null, password_reset_expiry: null },
      });
      await tx.refresh_tokens.updateMany({
        where: { user_id: user.id },
        data: { is_revoked: true },
      });
    });

    await this.auditLogService.recordLoginHistory(
      { id: user.id, email: user.email, firstName: user.first_name } as any,
      LoginAction.PASSWORD_CHANGED,
      { ip: null, ua: null, device: null },
      true,
    );

    return { message: 'Password reset successful' };
  }

  async changePassword(
    dto: { currentPassword: string; newPassword: string },
    user: User,
    req: Request,
  ): Promise<{ message: string }> {
    const stored = await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    if (!(await bcrypt.compare(dto.currentPassword, stored?.password ?? '')))
      throw new BadRequestException('Current password incorrect');

    const isReused = await this.passwordHistoryService.isPasswordReused(user.id, dto.newPassword);
    if (isReused)
      throw new BadRequestException('Cannot reuse a previous password. Please choose a different password.');

    const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    if (stored?.password) {
      await this.passwordHistoryService.addPasswordToHistory(user.id, stored.password);
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    });
    await this.refreshTokenService.revokeAllForUser(user.id);
    const ctx = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(user, LoginAction.PASSWORD_CHANGED, ctx, true);

    this.emailService.sendPasswordChangedEmail(user.email, user.firstName)
      .catch(e => this.logger.warn(`Password changed email failed: ${e.message}`));
    return { message: 'Password changed successfully. Please log in again.' };
  }
}
