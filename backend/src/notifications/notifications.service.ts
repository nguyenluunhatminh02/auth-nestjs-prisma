import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from './entities/notification.entity';
import { NotificationResponse } from '../auth/dto/auth-response.dto';
import { PageResponse, buildPageResponse } from '../common/utils/pagination.util';
import { NotificationType } from '../users/enums/notification-type.enum';
import { NotificationChannel } from '../users/enums/notification-channel.enum';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async send(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    channel: NotificationChannel,
    data?: string,
  ): Promise<Notification> {
    const notif = await this.prisma.notifications.create({
      data: {
        user_id: userId,
        title,
        message,
        type,
        channel,
        data,
        is_read: false,
      },
    });
    return this.toEntity(notif);
  }

  async getNotifications(userId: string, page: number, size: number): Promise<PageResponse<NotificationResponse>> {
    const total = await this.prisma.notifications.count({ where: { user_id: userId } });
    const items = await this.prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip: page * size,
      take: size,
    });
    return this.buildPage(items, page, size, total);
  }

  async getUnreadNotifications(userId: string, page: number, size: number): Promise<PageResponse<NotificationResponse>> {
    const total = await this.prisma.notifications.count({
      where: { user_id: userId, is_read: false },
    });
    const items = await this.prisma.notifications.findMany({
      where: { user_id: userId, is_read: false },
      orderBy: { created_at: 'desc' },
      skip: page * size,
      take: size,
    });
    return this.buildPage(items, page, size, total);
  }

  async getNotificationsByType(
    userId: string,
    type: NotificationType,
    page: number,
    size: number,
  ): Promise<PageResponse<NotificationResponse>> {
    const total = await this.prisma.notifications.count({
      where: { user_id: userId, type },
    });
    const items = await this.prisma.notifications.findMany({
      where: { user_id: userId, type },
      orderBy: { created_at: 'desc' },
      skip: page * size,
      take: size,
    });
    return this.buildPage(items, page, size, total);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notifications.count({
      where: { user_id: userId, is_read: false },
    });
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    const notif = await this.prisma.notifications.findFirst({
      where: { id, user_id: userId },
    });
    if (!notif) throw new NotFoundException('Notification not found');

    await this.prisma.notifications.update({
      where: { id },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
  }

  async markAsUnread(id: string, userId: string): Promise<void> {
    const notif = await this.prisma.notifications.findFirst({
      where: { id, user_id: userId },
    });
    if (!notif) throw new NotFoundException('Notification not found');

    await this.prisma.notifications.update({
      where: { id },
      data: {
        is_read: false,
        read_at: null,
      },
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
    return result.count;
  }

  async deleteNotification(id: string, userId: string): Promise<void> {
    const result = await this.prisma.notifications.deleteMany({
      where: { id, user_id: userId },
    });
    if (!result.count) throw new NotFoundException('Notification not found');
  }

  private mapToResponse(n: Notification): NotificationResponse {
    return {
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      channel: n.channel,
      isRead: n.isRead,
      readAt: n.readAt ?? null,
      data: n.data ?? null,
      createdAt: n.createdAt,
    };
  }

  private toEntity(n: any): Notification {
    return {
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      channel: n.channel,
      isRead: n.is_read,
      readAt: n.read_at,
      data: n.data,
      createdAt: n.created_at,
      user: null,
    } as unknown as Notification;
  }

  private buildPage(items: any[], page: number, size: number, total: number): PageResponse<NotificationResponse> {
    return buildPageResponse(items, (n) => this.mapToResponse(this.toEntity(n)), page, size, total);
  }
}
