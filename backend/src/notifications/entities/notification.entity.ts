import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NotificationType } from '../../users/enums/notification-type.enum';
import { NotificationChannel } from '../../users/enums/notification-channel.enum';

@Entity('notifications')
@Index('idx_notification_user_id', ['user'])
@Index('idx_notification_is_read', ['isRead'])
@Index('idx_notification_created_at', ['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 2000 })
  message: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ nullable: true, length: 2000 })
  data: string;

  @CreateDateColumn()
  createdAt: Date;
}
