import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordService } from './services/password.service';
import { MfaService } from './services/mfa.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { PasswordHistoryService } from './services/password-history.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailModule } from '../email/email.module';
import { CommonModule } from '../common/common.module';
import { RateLimiterService } from '../common/services/rate-limiter.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRATION') as any },
      }),
    }),
    EmailModule,
    CommonModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    EmailVerificationService,
    PasswordService,
    MfaService,
    RefreshTokenService,
    TokenBlacklistService,
    PasswordHistoryService,
    AuditLogService,
    JwtStrategy,
    GoogleStrategy,
    GithubStrategy,
    RateLimiterService,
    RolesGuard,
    RateLimitGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    AuthService,
    SessionService,
    RefreshTokenService,
    MfaService,
    TokenBlacklistService,
    PasswordService,
    JwtModule,
    PasswordHistoryService,
    RateLimiterService,
  ],
})
export class AuthModule {}
