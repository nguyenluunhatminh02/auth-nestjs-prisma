import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { PrismaService } from '../../prisma/prisma.service';
import { toAppUser } from '../../common/mappers/user.mapper';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService, private tokenBlacklistService: TokenBlacklistService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: { sub: string; email: string }) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) throw new UnauthorizedException('Token has been revoked');

    const areAllTokensBlacklisted = await this.tokenBlacklistService.areAllUserTokensBlacklisted(payload.sub);
    if (areAllTokensBlacklisted) throw new UnauthorizedException('All sessions have been revoked');

    const userRecord = await this.prisma.users.findFirst({
      where: { id: payload.sub, is_deleted: false },
      include: { user_roles: { include: { roles: true } } },
    });
    if (!userRecord) throw new UnauthorizedException('User not found');

    const appUser = toAppUser(userRecord);
    return { ...appUser, accessToken: token } as any;
  }
}
