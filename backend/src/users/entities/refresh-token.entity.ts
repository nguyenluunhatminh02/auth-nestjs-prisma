import { User } from './user.entity';

export class RefreshToken {
  id: string;
  token: string;
  isRevoked: boolean;
  expiresAt: Date;
  userAgent: string;
  ipAddress: string;
  deviceInfo: string;
  lastActiveAt: Date;
  createdAt: Date;
  user: User;
}
