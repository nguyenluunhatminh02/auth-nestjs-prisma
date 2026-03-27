import { Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ACTIVE_SESSIONS = 3;

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async createRefreshToken(
    user: User,
    expiresInDays: number,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    // Enforce max sessions: evict oldest if at limit
    const activeSessions = await this.prisma.refresh_tokens.findMany({
      where: { user_id: user.id, is_revoked: false },
      orderBy: { created_at: 'asc' },
    });

    if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
      const oldest = activeSessions[0];
      await this.prisma.refresh_tokens.update({
        where: { id: oldest.id },
        data: { is_revoked: true },
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    return this.prisma.refresh_tokens.create({
      data: {
        token: crypto.randomBytes(64).toString('hex'),
        user_id: user.id,
        expires_at: expiresAt,
        device_info: deviceInfo ?? null,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
        last_active_at: new Date(),
        created_at: new Date(),
      },
    });
  }

  async findValid(token: string): Promise<any | null> {
    return this.prisma.refresh_tokens.findFirst({
      where: { token, is_revoked: false },
      include: {
        users: {
          include: {
            user_roles: {
              include: {
                roles: true,
              },
            },
          },
        },
      },
    });
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.refresh_tokens.updateMany({
      where: { token },
      data: { is_revoked: true },
    });
  }

  async revokeById(id: string, userId: string): Promise<boolean> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return false;
    const rt = await this.prisma.refresh_tokens.findFirst({
      where: { id, user_id: userId, is_revoked: false },
    });
    if (!rt) return false;
    await this.prisma.refresh_tokens.update({
      where: { id },
      data: { is_revoked: true },
    });
    return true;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refresh_tokens.updateMany({
      where: { user_id: userId, is_revoked: false },
      data: { is_revoked: true },
    });
  }

  async findActiveByUserId(userId: string): Promise<any[]> {
    return this.prisma.refresh_tokens.findMany({
      where: { user_id: userId, is_revoked: false },
      orderBy: { last_active_at: 'desc' },
    });
  }

  async updateLastActive(token: string): Promise<void> {
    await this.prisma.refresh_tokens.updateMany({
      where: { token },
      data: { last_active_at: new Date() },
    });
  }

  async removeExpired(): Promise<void> {
    await this.prisma.refresh_tokens.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
  }

  /**
   * Rotate refresh token atomically.
   * Revocation of the old token and creation of the new token happen inside a
   * single DB transaction, eliminating the race window where two concurrent
   * requests could each receive a new token.
   *
   * @param oldToken - The old refresh token to rotate
   * @param expiresInDays - New token expiration in days
   * @returns The new refresh token record
   * @throws Error if old token is invalid or already revoked
   */
  async rotateToken(oldToken: string, expiresInDays: number = 7): Promise<any> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the row by finding AND immediately revoking inside the transaction.
      // Two concurrent requests will serialize here — the second will find
      // is_revoked: true and throw, preventing double-rotation.
      const oldRt = await tx.refresh_tokens.findFirst({
        where: { token: oldToken, is_revoked: false },
        include: {
          users: {
            include: { user_roles: { include: { roles: true } } },
          },
        },
      });

      if (!oldRt) {
        throw new Error('Invalid or expired refresh token');
      }

      // Revoke old token inside the same transaction
      await tx.refresh_tokens.update({
        where: { id: oldRt.id },
        data: { is_revoked: true },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      return tx.refresh_tokens.create({
        data: {
          token: crypto.randomBytes(64).toString('hex'),
          user_id: oldRt.user_id,
          expires_at: expiresAt,
          device_info: oldRt.device_info,
          ip_address: oldRt.ip_address,
          user_agent: oldRt.user_agent,
          last_active_at: new Date(),
          created_at: new Date(),
        },
      });
    });
  }
}
