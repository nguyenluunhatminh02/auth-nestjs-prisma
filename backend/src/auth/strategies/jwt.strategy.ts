import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { PrismaService } from '../../prisma/prisma.service';
import { toAppUser } from '../../common/mappers/user.mapper';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    // 1. Chá»‰ cháº¥p nháº­n ACCESS token (khÃ´ng cháº¥p nháº­n REFRESH hay MFA_PENDING)
    if (payload.type && payload.type !== 'ACCESS') {
      throw new UnauthorizedException('Invalid token type');
    }

    // 2. Kiá»ƒm tra blacklist theo JTI
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
      if (isBlacklisted) throw new UnauthorizedException('Token has been revoked');
    }

    // 3. Load user tá»« DB vá»›i roles + permissions
    const userRecord = await this.prisma.users.findFirst({
      where: { id: payload.sub, is_deleted: false },
      include: {
        user_roles: {
          include: { roles: true },
        },
      },
    });
    if (!userRecord) throw new UnauthorizedException('User not found');
    if (!userRecord.is_active) throw new UnauthorizedException('Account is disabled');

    const appUser = toAppUser(userRecord);
    const roles = userRecord.user_roles.map((ur: any) => ur.roles.name as string);

    // 4. Tráº£ vá» user object Ä‘Ã­nh kÃ¨m accessToken + deviceId
    return {
      ...appUser,
      roles,
      deviceId: payload.deviceId ?? null,
      accessToken: token,
    };
  }
}
