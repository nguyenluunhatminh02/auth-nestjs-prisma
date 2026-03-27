import { User } from './user.entity';

export class PasswordHistory {
  id: string;
  userId: string;
  user: User;
  passwordHash: string;
  createdAt: Date;
}
