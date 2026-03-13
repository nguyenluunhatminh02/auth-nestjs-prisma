import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeleteStatus } from '../../users/enums/delete-status.enum';
import { DELETE_GRACE_PERIOD_MS } from '../constants/auth.constants';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ScheduledDeleteService {
  private readonly logger = new Logger(ScheduledDeleteService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async permanentlyDeleteExpiredAccounts() {
    const thirtyDaysAgo = new Date(Date.now() - DELETE_GRACE_PERIOD_MS);

    const users = await this.prisma.users.findMany({
      where: {
        delete_status: DeleteStatus.DELETE_REQUESTED,
        delete_requested_at: { lt: thirtyDaysAgo },
      },
    });

    for (const user of users) {
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          delete_status: DeleteStatus.PERMANENTLY_DELETED,
          is_deleted: true,
          is_active: false,
          email: `deleted_${user.id}@deleted.local`,
          first_name: 'Deleted',
          last_name: 'User',
          phone: null,
          avatar_url: null,
          password: null,
          two_factor_secret: null,
          two_factor_enabled: false,
        },
      });
    }

    if (users.length > 0) {
      this.logger.log(`Permanently deleted ${users.length} expired account(s)`);
    }
  }
}
