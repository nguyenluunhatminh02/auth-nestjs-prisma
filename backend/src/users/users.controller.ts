import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { AuthService } from '../auth/services/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto, UpdatePrivacySettingsDto } from './dto/update-settings.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { SetupSecurityQuestionsDto } from './dto/security-questions.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
  ) {}

  // ── Profile ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: User) {
    return this.authService.mapToUserResponse(user);
  }

  @Put()
  @ApiOperation({ summary: 'Update profile' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(user.id, {
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    });
    return this.authService.mapToUserResponse(updated);
  }

  // ── Delete account ────────────────────────────────────────────────────────────

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account deletion (30-day grace period)' })
  async deleteMe(
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    await this.authService.deleteAccount(user, user.accessToken, req);
    return { message: 'Account deletion requested. You have 30 days to cancel.' };
  }

  @Post('cancel-delete')
  @ApiOperation({ summary: 'Cancel account deletion' })
  async cancelDelete(@CurrentUser() user: User) {
    await this.authService.cancelDeleteAccount(user);
    return { message: 'Account deletion cancelled' };
  }

  // ── Notification preferences ───────────────────────────────────────────────

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getNotificationPreferences(@CurrentUser() user: User) {
    return this.usersService.getNotificationPreferences(user.id);
  }

  @Put('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotificationPreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(user.id, dto);
  }

  // ── Privacy settings ───────────────────────────────────────────────────────

  @Get('privacy')
  @ApiOperation({ summary: 'Get privacy settings' })
  getPrivacySettings(@CurrentUser() user: User) {
    return this.usersService.getPrivacySettings(user.id);
  }

  @Put('privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  updatePrivacySettings(
    @CurrentUser() user: User,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return this.usersService.updatePrivacySettings(user.id, dto);
  }

  // ── FCM token ────────────────────────────────────────────────────────────────

  @Post('fcm-token')
  @ApiOperation({ summary: 'Register FCM token for push notifications' })
  async updateFcmToken(
    @CurrentUser() user: User,
    @Body() dto: UpdateFcmTokenDto,
  ) {
    await this.usersService.updateFcmToken(user.id, dto.fcmToken);
    return { message: 'FCM token updated' };
  }

  // ── Device fingerprints ───────────────────────────────────────────────────────

  @Get('devices')
  @ApiOperation({ summary: 'Get registered devices' })
  getDevices(@CurrentUser() user: User) {
    return this.usersService.getDevices(user.id);
  }

  @Post('devices/:id/trust')
  @ApiOperation({ summary: 'Trust a device' })
  async trustDevice(@CurrentUser() user: User, @Param('id') deviceId: string) {
    await this.usersService.trustDevice(user.id, deviceId);
    return { message: 'Device trusted' };
  }

  @Post('devices/:id/untrust')
  @ApiOperation({ summary: 'Untrust a device' })
  async untrustDevice(@CurrentUser() user: User, @Param('id') deviceId: string) {
    await this.usersService.untrustDevice(user.id, deviceId);
    return { message: 'Device untrusted' };
  }

  @Delete('devices/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a device' })
  async removeDevice(@CurrentUser() user: User, @Param('id') deviceId: string) {
    await this.usersService.removeDevice(user.id, deviceId);
    return { message: 'Device removed' };
  }

  // ── Security questions ────────────────────────────────────────────────────────

  @Post('security-questions')
  @ApiOperation({ summary: 'Set up security questions (1-3)' })
  async setupSecurityQuestions(
    @CurrentUser() user: User,
    @Body() dto: SetupSecurityQuestionsDto,
  ) {
    await this.usersService.setupSecurityQuestions(user.id, dto.questions);
    return { message: 'Security questions set up' };
  }

  @Get('security-questions')
  @ApiOperation({ summary: 'Get security questions (without answers)' })
  getSecurityQuestions(@CurrentUser() user: User) {
    return this.usersService.getSecurityQuestions(user.id);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  getSessions(@CurrentUser() user: User & { accessToken: string }) {
    return this.usersService.getActiveSessions(user.id, user.accessToken);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout a specific session' })
  async deleteSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: User & { accessToken: string },
    @Req() req: Request,
  ) {
    await this.authService.logoutSession(user.accessToken, sessionId, user, req);
    return { message: 'Session logged out' };
  }

  // ── Login history ─────────────────────────────────────────────────────────────

  @Get('login-history')
  @ApiOperation({ summary: 'Get paginated login history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  getLoginHistory(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.usersService.getLoginHistory(user.id, page, size);
  }
}

