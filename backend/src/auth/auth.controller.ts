import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './services/auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaLoginDto, MfaVerifyDto } from './dto/mfa.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleOAuthGuard, GithubOAuthGuard } from './guards/oauth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@ApiTags('auth')
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // ─── Registration & Verification ─────────────────────────────────────────────

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req);
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend verification email' })
  resendVerification(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  // ─── Login ────────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  @Public()
  @Post('mfa/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete login with MFA code' })
  mfaValidate(@Body() dto: MfaLoginDto, @Req() req: Request) {
    return this.authService.validateMfaLogin(dto, req);
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────────

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshToken(dto.refreshToken, req);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    return this.authService.logout(user.accessToken, dto.refreshToken, user, req);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions' })
  logoutAll(
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    return this.authService.logoutAll(user.accessToken, user, req);
  }

  // ─── Password ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    return this.authService.changePassword(dto, user, req);
  }

  // ─── MFA ─────────────────────────────────────────────────────────────────────

  @Post('mfa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start MFA setup — returns QR code & backup codes' })
  mfaSetup(@CurrentUser() user: User) {
    return this.authService.setupMfa(user);
  }

  @Post('mfa/verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify TOTP code during setup and enable MFA' })
  mfaVerify(
    @Body() dto: MfaVerifyDto,
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    return this.authService.verifyAndEnableMfa(dto, user, req);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA with TOTP confirmation' })
  mfaDisable(
    @Body() dto: MfaVerifyDto,
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    return this.authService.disableMfa(dto, user, req);
  }

  // ─── OAuth2 ───────────────────────────────────────────────────────────────────

  @Public()
  @Get('oauth2/google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth2 login' })
  googleAuth() {}

  @Public()
  @Get('oauth2/google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google OAuth2 callback' })
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  @Public()
  @Get('oauth2/github')
  @UseGuards(GithubOAuthGuard)
  @ApiOperation({ summary: 'Initiate GitHub OAuth2 login' })
  githubAuth() {}

  @Public()
  @Get('oauth2/github/callback')
  @UseGuards(GithubOAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth2 callback' })
  githubCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  private async handleOAuthCallback(req: Request, res: Response) {
    const authResponse = await this.authService.handleOAuthLogin(req.user as any, req);
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const params = new URLSearchParams({
      token: authResponse.accessToken,
      refresh_token: authResponse.refreshToken,
    });
    res.redirect(`${frontendUrl}/oauth2/redirect?${params}`);
  }
}
