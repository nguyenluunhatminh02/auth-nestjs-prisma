import {
  Controller,
  Get,
  Delete,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../services/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { Public } from '../decorators/public.decorator';

const PROVIDERS = [
  { name: 'google', displayName: 'Google', icon: 'google' },
  { name: 'github', displayName: 'GitHub', icon: 'github' },
];

@ApiTags('OAuth2')
@Controller('auth/oauth2')
export class OAuth2Controller {
  constructor(private readonly authService: AuthService) {}

  // ─── List available providers ─────────────────────────────────────────────
  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'List available OAuth2 providers' })
  getProviders() {
    return { providers: PROVIDERS };
  }

  // ─── OAuth2 Callback ──────────────────────────────────────────────────────
  // Passport gọi strategy → validate() → req.user = OAuthProfile
  // Sau đó controller lấy req.user và xử lý

  @Public()
  @Get('callback/:provider')
  @ApiOperation({ summary: 'OAuth2 callback — handled by Passport' })
  @UseGuards(AuthGuard('google')) // Thay bằng dynamic guard nếu cần
  async oauthCallback(@Req() req: Request) {
    const profile = (req as any).user;
    return this.authService.handleOAuthLogin(profile, req);
  }

  // ─── Connected accounts ───────────────────────────────────────────────────
  @Get('connected-accounts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List linked OAuth accounts' })
  async getConnectedAccounts(@CurrentUser('id') userId: string) {
    // Sẽ query oauth_accounts table
    return { accounts: [] }; // TODO: implement via PrismaService
  }

  // ─── Disconnect provider ──────────────────────────────────────────────────
  @Delete('connected-accounts/:provider')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect an OAuth provider' })
  disconnectProvider(
    @CurrentUser() user: User,
    @Param('provider') provider: string,
  ) {
    return { message: `${provider} disconnected` }; // TODO: implement
  }
}
