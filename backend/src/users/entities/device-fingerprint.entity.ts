import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('device_fingerprints')
@Index('idx_device_fp_user_id', ['user'])
@Index('idx_device_fp_fingerprint', ['fingerprint'])
export class DeviceFingerprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ length: 255 })
  fingerprint: string;

  @Column({ nullable: true, length: 255 })
  deviceName: string;

  @Column({ nullable: true, length: 100 })
  browser: string;

  @Column({ nullable: true, length: 100 })
  os: string;

  @Column({ nullable: true, length: 50 })
  ipAddress: string;

  @Column({ default: false })
  isTrusted: boolean;

  @Column({ nullable: true })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
