import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { LoginAction } from '../enums/login-action.enum';

@Entity('login_history')
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.loginHistories, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'enum', enum: LoginAction })
  action: LoginAction;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true, length: 512 })
  userAgent: string;

  @Column({ nullable: true })
  deviceInfo: string;

  @Column({ nullable: true })
  success: boolean;

  @Column({ nullable: true })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;
}
