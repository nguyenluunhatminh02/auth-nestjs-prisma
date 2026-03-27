import { User } from './user.entity';

export class SecurityQuestion {
  id: string;
  user: User;
  question: string;
  answerHash: string;
  sortOrder: number;
  createdAt: Date;
}
