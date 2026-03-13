import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { OAuthProfile } from './google.strategy';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('oauth2.github.clientId'),
      clientSecret: config.get<string>('oauth2.github.clientSecret'),
      callbackURL: config.get<string>('oauth2.github.callbackUrl'),
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ) {
    const email =
      profile.emails?.[0]?.value ?? `${profile.username}@github.local`;
    const oauthProfile: OAuthProfile = {
      providerId: profile.id.toString(),
      email,
      firstName: profile.displayName?.split(' ')[0] ?? profile.username,
      lastName: profile.displayName?.split(' ').slice(1).join(' ') ?? '',
      avatarUrl: profile.photos?.[0]?.value ?? null,
      provider: 'GITHUB',
    };
    done(null, oauthProfile);
  }
}
