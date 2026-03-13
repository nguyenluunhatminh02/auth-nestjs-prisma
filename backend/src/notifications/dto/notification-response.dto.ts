export interface NotificationResponse {
  id: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  isRead: boolean;
  readAt?: Date;
  data?: string;
  createdAt: Date;
}
