import { User } from '../../users/entities/user.entity';
import { NotificationType } from '../../users/enums/notification-type.enum';
import { NotificationChannel } from '../../users/enums/notification-channel.enum';

export class Notification {
  id: string;
  user: User;
  title: string;
  message: string;
  type: NotificationType;
  channel: NotificationChannel;
  isRead: boolean;
  readAt: Date;
  data: string;
  createdAt: Date;
}
