import { User } from './user.entity';

export class DeviceFingerprint {
  id: string;
  user: User;
  fingerprint: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  isTrusted: boolean;
  lastSeenAt: Date;
  createdAt: Date;
}
