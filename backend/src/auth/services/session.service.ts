import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { LoginAction } from '../../users/enums/login-action.enum';
import { DeleteStatus } from '../../users/enums/delete-status.enum';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    private tokenBlacklistService: TokenBlacklistService,
    private auditLogService: AuditLogService,
  ) {}

  async deleteAccount(user: User, accessToken: string, req: Request): Promise<void> {
    const { ip } = extractRequestContext(req);

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        delete_status: DeleteStatus.DELETE_REQUESTED,
        delete_requested_at: new Date(),
        is_active: false,
      },
    });

    await this.tokenService.revokeAllSessions(user.id);
    await this.tokenService.blacklistToken(accessToken);
    await this.auditLogService.recordAuditLog(user.id, 'ACCOUNT_DELETE_REQUESTED', ip);
  }

  async cancelDeleteAccount(user: User): Promise<void> {
    if ((user as any).deleteStatus !== DeleteStatus.DELETE_REQUESTED) {
      throw new NotFoundException('No pending delete request');
    }
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        delete_status: DeleteStatus.ACTIVE,
        delete_requested_at: null,
        is_active: true,
      },
    });
  }

  async logoutSession(accessToken: string, deviceId: string, user: User, req: Request): Promise<void> {
    const { ip } = extractRequestContext(req);
    await this.tokenService.revokeDeviceSession(user.id, deviceId);
    await this.tokenService.blacklistToken(accessToken);
    await this.auditLogService.recordAuditLog(user.id, 'LOGOUT_SESSION', ip);
  }
}
