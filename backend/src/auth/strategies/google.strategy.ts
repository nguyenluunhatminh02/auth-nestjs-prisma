import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface OAuthProfile {
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  provider: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('oauth2.google.clientId'),
      clientSecret: config.get<string>('oauth2.google.clientSecret'),
      callbackURL: config.get<string>('oauth2.google.callbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const oauthProfile: OAuthProfile = {
      providerId: profile.id,
      email: profile.emails[0].value,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      provider: 'GOOGLE',
    };
    done(null, oauthProfile);
  }
}
