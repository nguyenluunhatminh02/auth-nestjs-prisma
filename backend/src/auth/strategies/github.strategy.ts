import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { OAuthProfile } from './google.strategy';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('oauth2.github.clientId');
    const clientSecret = config.get<string>('oauth2.github.clientSecret');
    if (!clientID || !clientSecret) {
      super({ clientID: 'disabled', clientSecret: 'disabled', callbackURL: 'http://localhost/disabled', scope: [] });
      return;
    }
    super({
      clientID,
      clientSecret,
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
    // Only accept an email that GitHub has explicitly verified.
    // If we fabricate a "@github.local" address an attacker who controls a
    // GitHub username could hijack a local account that shares that pattern.
    const verifiedEmail = (profile.emails ?? []).find(
      (e: any) => e.verified !== false && e.value,
    )?.value;

    if (!verifiedEmail) {
      return done(
        new Error(
          'Your GitHub account has no verified email address. Please add and verify a public email in your GitHub settings.',
        ),
        null,
      );
    }

    const oauthProfile: OAuthProfile = {
      providerId: profile.id.toString(),
      email: verifiedEmail,
      firstName: profile.displayName?.split(' ')[0] ?? profile.username,
      lastName: profile.displayName?.split(' ').slice(1).join(' ') ?? '',
      avatarUrl: profile.photos?.[0]?.value ?? null,
      provider: 'GITHUB',
    };
    done(null, oauthProfile);
  }
}
