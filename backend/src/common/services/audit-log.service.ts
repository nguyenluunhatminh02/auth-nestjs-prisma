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

  /** Ghi vào bảng audit_logs mới (ticket-booking-nestjs compat) */
  async recordAuditLog(
    userId: string | null,
    action: string,
    ipAddress?: string,
    options?: {
      resource?: string;
      resourceType?: string;
      resourceId?: string;
      details?: string;
      userAgent?: string;
      deviceId?: string;
      success?: boolean;
    },
  ): Promise<void> {
    await this.prisma.audit_logs.create({
      data: {
        user_id: userId,
        action,
        ip_address: ipAddress ?? null,
        resource: options?.resource ?? null,
        resource_type: options?.resourceType ?? null,
        resource_id: options?.resourceId ?? null,
        details: options?.details ?? null,
        user_agent: options?.userAgent ?? null,
        device_id: options?.deviceId ?? null,
        success: options?.success ?? true,
      },
    }).catch((err) => {
      this.logger.warn(`Failed to record audit log: ${err.message}`);
    });
  }

  /** Lấy audit logs paginated */
  async getAuditLogs(
    userId: string,
    page = 1,
    size = 20,
  ): Promise<{ data: any[]; total: number; page: number; size: number }> {
    const skip = (page - 1) * size;
    const [data, total] = await Promise.all([
      this.prisma.audit_logs.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: size,
      }),
      this.prisma.audit_logs.count({ where: { user_id: userId } }),
    ]);
    return { data, total, page, size };
  }
}
