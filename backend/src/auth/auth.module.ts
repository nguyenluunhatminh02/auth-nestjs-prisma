import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './controllers/auth.controller';
import { DeviceController } from './controllers/device.controller';
import { MfaController } from './controllers/mfa.controller';
import { OAuth2Controller } from './controllers/oauth2.controller';

import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordService } from './services/password.service';
import { MfaService } from './services/mfa.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { PasswordHistoryService } from './services/password-history.service';
import { LoginAttemptService } from './services/login-attempt.service';
import { DeviceService } from './services/device.service';

import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

import { EmailModule } from '../email/email.module';
import { CommonModule } from '../common/common.module';
import { RateLimiterService } from '../common/services/rate-limiter.service';
import { AuditLogService } from '../common/services/audit-log.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<number>('JWT_ACCESS_TOKEN_EXPIRATION', 900_000) / 1000,
        },
      }),
    }),
    EmailModule,
    CommonModule,
  ],
  controllers: [AuthController, DeviceController, MfaController, OAuth2Controller],
  providers: [
    AuthService, TokenService, SessionService, EmailVerificationService,
    PasswordService, MfaService, TokenBlacklistService, PasswordHistoryService,
    LoginAttemptService, DeviceService,
    AuditLogService, RateLimiterService,
    JwtStrategy, GoogleStrategy, GithubStrategy,
    RolesGuard, RateLimitGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    AuthService, TokenService, SessionService, MfaService,
    TokenBlacklistService, PasswordService, PasswordHistoryService,
    LoginAttemptService, DeviceService, RateLimiterService, AuditLogService,
    JwtModule,
  ],
})
export class AuthModule {}
