import { User } from './user.entity';
import { LoginAction } from '../enums/login-action.enum';

export class LoginHistory {
  id: string;
  user: User;
  action: LoginAction;
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
  success: boolean;
  failureReason: string;
  createdAt: Date;
}
