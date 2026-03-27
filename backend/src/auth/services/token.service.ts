import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface TokenUser {
  id: string;
  email: string;
  roles: string[];
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    // milliseconds
    this.accessTtlMs = config.get<number>('JWT_ACCESS_TOKEN_EXPIRATION', 900_000);
    this.refreshTtlMs = config.get<number>('JWT_REFRESH_TOKEN_EXPIRATION', 604_800_000);
  }

  // ─── Access Token ──────────────────────────────────────────────────────────

  generateAccessToken(user: TokenUser, deviceId: string): string {
    const jti = uuidv4();
    const expiresIn = Math.floor(this.accessTtlMs / 1000);
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        deviceId,
        type: 'ACCESS',
        jti,
      },
      { expiresIn },
    );
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  generateRefreshToken(
    user: TokenUser,
    deviceId: string,
    rememberMe = false,
  ): { token: string; jti: string; ttlSec: number } {
    const jti = uuidv4();
    // rememberMe → 28 ngày, bình thường → config
    const ttlSec = rememberMe ? 28 * 24 * 3600 : Math.floor(this.refreshTtlMs / 1000);
    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        deviceId,
        type: 'REFRESH',
        jti,
      },
      { expiresIn: ttlSec },
    );
    return { token, jti, ttlSec };
  }

  // ─── MFA Token (5 min) ─────────────────────────────────────────────────────

  generateMfaToken(userId: string): string {
    const jti = uuidv4();
    return this.jwtService.sign(
      { sub: userId, type: 'MFA_PENDING', jti },
      { expiresIn: 300 },
    );
  }

  decodeMfaToken(token: string): { userId: string } | null {
    try {
      const payload = this.jwtService.verify(token) as any;
      if (payload.type !== 'MFA_PENDING') return null;
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }

  // ─── Redis: lưu / validate Refresh Token ──────────────────────────────────

  /**
   * Lưu JTI của refresh token vào Redis.
   * Key format: refresh:{userId}:{deviceId}
   */
  async storeRefreshToken(
    userId: string,
    deviceId: string,
    jti: string,
    ttlSec: number,
  ): Promise<void> {
    await this.redis.set(`refresh:${userId}:${deviceId}`, jti, ttlSec);
  }

  /**
   * Kiểm tra refresh token hợp lệ:
   * 1. Verify JWT signature + expiry
   * 2. Kiểm tra type === 'REFRESH'
   * 3. So sánh JTI trong Redis
   */
  async validateRefreshToken(
    token: string,
  ): Promise<{ userId: string; deviceId: string; roles: string[] } | null> {
    try {
      const payload = this.jwtService.verify(token) as any;
      if (payload.type !== 'REFRESH') return null;

      const storedJti = await this.redis.get(`refresh:${payload.sub}:${payload.deviceId}`);
      if (!storedJti || storedJti !== payload.jti) return null;

      return { userId: payload.sub, deviceId: payload.deviceId, roles: payload.roles || [] };
    } catch {
      return null;
    }
  }

  // ─── Blacklist (Access Token) ──────────────────────────────────────────────

  async blacklistToken(token: string): Promise<void> {
    try {
      const payload = this.jwtService.decode(token) as any;
      if (!payload?.jti || !payload?.exp) return;
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.set(`blacklist:${payload.jti}`, '1', ttl);
      }
    } catch (err) {
      this.logger.warn(`Could not blacklist token: ${err.message}`);
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const payload = this.jwtService.decode(token) as any;
      if (!payload?.jti) return false;
      return await this.redis.exists(`blacklist:${payload.jti}`);
    } catch {
      return false;
    }
  }

  // ─── Revoke Sessions ───────────────────────────────────────────────────────

  /** Thu hồi 1 device session: xóa Redis key + set device inactive */
  async revokeDeviceSession(userId: string, deviceId: string): Promise<void> {
    await this.redis.del(`refresh:${userId}:${deviceId}`);
    await this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: deviceId },
      data: { active: false },
    });
  }

  /** Thu hồi tất cả sessions (logout all) */
  async revokeAllSessions(userId: string): Promise<void> {
    const keys = await this.redis.keys(`refresh:${userId}:*`);
    if (keys.length > 0) await this.redis.delMany(keys);
    await this.prisma.user_devices.updateMany({
      where: { user_id: userId },
      data: { active: false },
    });
  }

  /** Thu hồi tất cả sessions trừ device hiện tại */
  async revokeOtherSessions(userId: string, currentDeviceId: string): Promise<void> {
    const allKeys = await this.redis.keys(`refresh:${userId}:*`);
    const otherKeys = allKeys.filter(k => !k.endsWith(`:${currentDeviceId}`));
    if (otherKeys.length > 0) await this.redis.delMany(otherKeys);
    await this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: { not: currentDeviceId } },
      data: { active: false },
    });
  }

  /** Đếm số active sessions của user */
  async getActiveSessionCount(userId: string): Promise<number> {
    const keys = await this.redis.keys(`refresh:${userId}:*`);
    return keys.length;
  }
}
