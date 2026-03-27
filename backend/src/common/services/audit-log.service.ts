import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginAction } from '../../users/enums/login-action.enum';
import { RequestContext } from '../../common/utils/request-context.util';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  async recordLoginHistory(
    user: { id: string },
    action: LoginAction,
    ctx: RequestContext,
    success: boolean,
    failureReason: string | null = null,
  ): Promise<void> {
    await this.prisma.login_history.create({
      data: {
        user_id: user.id,
        action,
        ip_address: ctx.ip,
        user_agent: ctx.ua,
        device_info: ctx.device,
        success,
        failure_reason: failureReason ?? null,
      },
    }).catch((err) => {
      this.logger.warn(`Failed to record login history: ${err.message}`);
    });
  }
}
