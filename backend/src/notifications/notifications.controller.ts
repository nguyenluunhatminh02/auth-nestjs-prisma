import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { NotificationType } from '../users/enums/notification-type.enum';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  getNotifications(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.notifService.getNotifications(user.id, page, Math.min(Math.max(1, size), 100));
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get unread notifications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  getUnread(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.notifService.getUnreadNotifications(user.id, page, Math.min(Math.max(1, size), 100));
  }

  @Get('type/:type')
  @ApiOperation({ summary: 'Get notifications by type' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  getByType(
    @CurrentUser() user: User,
    @Param('type') type: NotificationType,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.notifService.getNotificationsByType(user.id, type, page, Math.min(Math.max(1, size), 100));
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: User) {
    const count = await this.notifService.getUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@CurrentUser() user: User, @Param('id') id: string) {
    await this.notifService.markAsRead(id, user.id);
    return { message: 'Marked as read' };
  }

  @Patch(':id/unread')
  @ApiOperation({ summary: 'Mark notification as unread' })
  async markAsUnread(@CurrentUser() user: User, @Param('id') id: string) {
    await this.notifService.markAsUnread(id, user.id);
    return { message: 'Marked as unread' };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: User) {
    const count = await this.notifService.markAllAsRead(user.id);
    return { count };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  async deleteNotification(@CurrentUser() user: User, @Param('id') id: string) {
    await this.notifService.deleteNotification(id, user.id);
    return { message: 'Notification deleted' };
  }
}
