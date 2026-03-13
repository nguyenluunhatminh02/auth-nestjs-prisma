import {
  Column,
  Entity,
  ManyToMany,
  JoinTable,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AuthProvider } from '../enums/auth-provider.enum';
import { DeleteStatus } from '../enums/delete-status.enum';
import { RefreshToken } from './refresh-token.entity';
import { LoginHistory } from './login-history.entity';
import { Role } from './role.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true, length: 20 })
  gender: string;

  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Column({ nullable: true })
  providerId: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  emailVerificationToken: string;

  @Column({ nullable: true })
  emailVerificationExpiry: Date;

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpiry: Date;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true })
  twoFactorSecret: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockTime: Date;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true, length: 50 })
  lastLoginIp: string;

  // Legacy soft-delete flag kept for backward compat
  @Column({ default: false })
  isDeleted: boolean;

  @Column({ nullable: true })
  deletedAt: Date;

  // ── Preferences ──────────────────────────────────────────────────────────────
  @Column({ default: 'en', length: 10 })
  language: string;

  @Column({ default: 'UTC', length: 50 })
  timezone: string;

  // ── Notification preferences ──────────────────────────────────────────────────
  @Column({ default: true })
  notificationEmailEnabled: boolean;

  @Column({ default: true })
  notificationPushEnabled: boolean;

  @Column({ default: true })
  notificationInAppEnabled: boolean;

  @Column({ default: true })
  notificationSecurityEnabled: boolean;

  @Column({ default: true })
  notificationOrderEnabled: boolean;

  @Column({ default: false })
  notificationPromotionEnabled: boolean;

  // ── Privacy settings ──────────────────────────────────────────────────────────
  @Column({ default: false })
  profilePublic: boolean;

  @Column({ default: false })
  showEmail: boolean;

  @Column({ default: false })
  showPhone: boolean;

  @Column({ default: true })
  showActivityStatus: boolean;

  // ── Enhanced soft-delete ──────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: DeleteStatus, default: DeleteStatus.ACTIVE })
  deleteStatus: DeleteStatus;

  @Column({ nullable: true })
  deleteRequestedAt: Date;

  // ── FCM token ─────────────────────────────────────────────────────────────────
  @Column({ nullable: true, length: 500 })
  fcmToken: string;

  @ManyToMany(() => Role, { eager: true })
  @JoinTable({ name: 'user_roles' })
  roles: Role[];

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => LoginHistory, (lh) => lh.user)
  loginHistories: LoginHistory[];
}

