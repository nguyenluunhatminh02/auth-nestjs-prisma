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
}
