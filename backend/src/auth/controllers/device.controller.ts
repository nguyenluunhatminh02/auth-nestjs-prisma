import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DeviceService } from '../services/device.service';
import { TokenService } from '../services/token.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { RenameDeviceDto } from '../dto/auth.dto';
import { DeviceResponseDto, ActiveSessionsResponseDto } from '../dto/response.dto';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly tokenService: TokenService,
  ) {}

  // ─── List active devices ──────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'List all active devices' })
  async getDevices(@CurrentUser() user: User): Promise<DeviceResponseDto[]> {
    const devices = await this.deviceService.getActiveDevices(user.id);
    return devices.map(DeviceResponseDto.from);
  }

  // ─── Session summary ──────────────────────────────────────────────────────
  @Get('sessions')
  @ApiOperation({ summary: 'Get active session summary' })
  async getSessions(@CurrentUser() user: User): Promise<ActiveSessionsResponseDto> {
    const [devices, count] = await Promise.all([
      this.deviceService.getActiveDevices(user.id),
      this.tokenService.getActiveSessionCount(user.id),
    ]);
    return {
      activeCount: count,
      devices: devices.map(DeviceResponseDto.from),
    };
  }

  // ─── Remove specific device ───────────────────────────────────────────────
  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a specific device and revoke its session' })
  async removeDevice(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
  ) {
    await this.deviceService.deactivateDevice(user.id, deviceId);
    await this.tokenService.revokeDeviceSession(user.id, deviceId);
  }

  // ─── Remove all other devices ─────────────────────────────────────────────
  @Delete('others')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove all other devices and revoke their sessions' })
  async removeOtherDevices(
    @CurrentUser() user: User,
    @CurrentUser('deviceId') currentDeviceId: string,
  ) {
    await this.deviceService.deactivateOtherDevices(user.id, currentDeviceId);
    await this.tokenService.revokeOtherSessions(user.id, currentDeviceId);
  }

  // ─── Trust device ─────────────────────────────────────────────────────────
  @Post(':deviceId/trust')
  @ApiOperation({ summary: 'Mark device as trusted (skips MFA)' })
  trustDevice(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.trustDevice(user.id, deviceId);
  }

  // ─── Untrust device ───────────────────────────────────────────────────────
  @Delete(':deviceId/trust')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove trust from device' })
  untrustDevice(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.untrustDevice(user.id, deviceId);
  }

  // ─── Rename device ────────────────────────────────────────────────────────
  @Put(':deviceId/name')
  @ApiOperation({ summary: 'Rename a device' })
  renameDevice(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
    @Body() dto: RenameDeviceDto,
  ) {
    return this.deviceService.renameDevice(user.id, deviceId, dto.newName);
  }
}
