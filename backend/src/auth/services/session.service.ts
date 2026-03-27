import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { mapToUserResponse } from '../../common/mappers/user.mapper';
import { extractRequestContext } from '../../common/utils/request-context.util';
import { LoginAction } from '../../users/enums/login-action.enum';
import { DeleteStatus } from '../../users/enums/delete-status.enum';
import { AuthResponse } from '../dto/auth-response.dto';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private rtService: RefreshTokenService,
    private tokenBlacklistService: TokenBlacklistService,
    private auditLogService: AuditLogService,
  ) {}

  async logout(accessToken: string, refreshToken: string, user: User, req: Request): Promise<void> {
    const { ip, ua, device } = extractRequestContext(req);
    await this.rtService.revoke(refreshToken);
    try {
      const decoded = this.jwtService.verify(accessToken) as any;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) await this.tokenBlacklistService.addToBlacklist(accessToken, ttl);
      }
    } catch {
      // Token already expired or invalid — no need to blacklist
    }
    await this.auditLogService.recordLoginHistory(user, LoginAction.LOGOUT, { ip, ua, device }, true, null);
  }

  async logoutAll(accessToken: string, user: User, req: Request): Promise<void> {
    const { ip, ua, device } = extractRequestContext(req);
    await this.rtService.revokeAllForUser(user.id);
    try {
      const decoded = this.jwtService.verify(accessToken) as any;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) await this.tokenBlacklistService.addToBlacklist(accessToken, ttl);
      }
    } catch {
      // Token already expired or invalid
    }
    await this.auditLogService.recordLoginHistory(user, LoginAction.LOGOUT_ALL, { ip, ua, device }, true, null);
  }

  async logoutSession(accessToken: string, sessionId: string, user: User, req: Request): Promise<void> {
    const revoked = await this.rtService.revokeById(sessionId, user.id);
    if (!revoked) throw new NotFoundException('Session not found');
    const { ip, ua, device } = extractRequestContext(req);
    await this.auditLogService.recordLoginHistory(user, LoginAction.LOGOUT_SESSION, { ip, ua, device }, true, null);
  }

  async deleteAccount(user: User, accessToken: string, req: Request): Promise<void> {
    const { ip, ua, device } = extractRequestContext(req);

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        delete_status: DeleteStatus.DELETE_REQUESTED,
        delete_requested_at: new Date(),
        is_active: false,
      },
    });

    await this.rtService.revokeAllForUser(user.id);
    try {
      const decoded = this.jwtService.verify(accessToken) as any;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) await this.tokenBlacklistService.addToBlacklist(accessToken, ttl);
      }
    } catch {
      // Token already expired or invalid
    }
    await this.auditLogService.recordLoginHistory(user, LoginAction.ACCOUNT_DELETED, { ip, ua, device }, true, null);
  }

  async cancelDeleteAccount(user: User): Promise<void> {
    if (user.deleteStatus !== DeleteStatus.DELETE_REQUESTED) {
      throw new NotFoundException('No pending delete request');
    }
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        delete_status: DeleteStatus.ACTIVE,
        delete_requested_at: null,
        is_active: true,
      },
    });
  }

  async buildAuthResponse(user: any, req: Request): Promise<AuthResponse> {
    const expiresInDays = this.config.get<number>('REFRESH_TOKEN_EXPIRATION_DAYS') ?? 7;
    const { ip, ua, device: deviceInfo } = extractRequestContext(req);
    const rt = await this.rtService.createRefreshToken(user, expiresInDays, deviceInfo, ip, ua);
    const payload = { sub: user.id, email: user.email, jti: rt.id };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken: rt.token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: mapToUserResponse(user),
      mfaRequired: false,
    };
  }

  async buildAuthResponseWithRefreshToken(user: any, refreshTokenRecord: any): Promise<AuthResponse> {
    await this.rtService.updateLastActive(refreshTokenRecord.token);
    const payload = { sub: user.id, email: user.email, jti: refreshTokenRecord.id };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken: refreshTokenRecord.token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: mapToUserResponse(user),
      mfaRequired: false,
    };
  }
}
