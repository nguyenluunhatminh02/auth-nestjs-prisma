import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { LoginAttemptService } from '../services/login-attempt.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  ResendVerificationDto,
  MfaVerifyDto,
} from '../dto/auth.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────── 
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new account' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req);
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────
  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email with token' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // ─── Login ────────────────────────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login - returns tokens or mfaRequired' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  // ─── MFA Verify (complete login after MFA challenge) ─────────────────────
  @Public()
  @Post('verify-mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete MFA login challenge' })
  verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    return this.authService.validateMfaLogin(
      dto.mfaToken,
      dto.totpCode,
      req,
      dto.deviceId,
      dto.deviceName,
      dto.deviceType,
    );
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────
  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token' })
  refreshToken(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshToken(dto.refreshToken, req);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current device session' })
  logout(
    @CurrentUser() user: User,
    @Headers('authorization') authHeader: string,
    @Body('refreshToken') refreshToken: string,
    @Req() req: Request,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') ?? '';
    return this.authService.logout(accessToken, refreshToken ?? '', user, req);
  }

  // ─── Logout All ───────────────────────────────────────────────────────────
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all device sessions' })
  logoutAll(
    @CurrentUser() user: User,
    @Headers('authorization') authHeader: string,
    @Req() req: Request,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') ?? '';
    return this.authService.logoutAll(accessToken, user, req);
  }

  // ─── Logout specific device session ──────────────────────────────────────
  @Post('logout-session/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout a specific device session by deviceId' })
  logoutSession(
    @CurrentUser() user: User,
    @Headers('authorization') authHeader: string,
    @Req() req: Request,
    @Query('deviceId') deviceId: string,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') ?? '';
    return this.authService.logoutSession(accessToken, deviceId, user, req);
  }

  // ─── Forgot Password ─────────────────────────────────────────────────────
  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ─── Reset Password ───────────────────────────────────────────────────────
  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword({ token: dto.token, newPassword: dto.newPassword });
  }

  // ─── Change Password ──────────────────────────────────────────────────────
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password while logged in' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(dto, user, req);
  }

  // ─── Resend Verification ──────────────────────────────────────────────────
  @Public()
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  // ─── Login History ────────────────────────────────────────────────────────
  @Get('login-history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get login history (last 90 days)' })
  loginHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('size') size = 20,
  ) {
    return this.loginAttemptService.getLoginHistory(userId, +page, +size);
  }

  // ─── Security Events (Audit Logs) ─────────────────────────────────────────
  @Get('security-events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get audit log entries' })
  securityEvents(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('size') size = 20,
  ) {
    return this.auditLogService.getAuditLogs(userId, +page, +size);
  }
}
