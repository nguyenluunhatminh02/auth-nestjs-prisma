import { User } from './user.entity';

export class Role {
  id: string;
  name: string;
  users: User[];
}
