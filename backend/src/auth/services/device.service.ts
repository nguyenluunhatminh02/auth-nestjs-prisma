import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceLimitExceededException } from '../../common/exceptions';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Register / update device ─────────────────────────────────────────────

  /**
   * Đăng ký device mới hoặc cập nhật lastActiveAt nếu đã tồn tại.
   * Trả về record user_devices.
   */
  async registerDevice(
    userId: string,
    req: Request,
    deviceId?: string,
    deviceName?: string,
    deviceType?: string,
  ) {
    const ua = req.headers['user-agent'] || '';
    const ip = req.ip || req.socket?.remoteAddress || '';
    const parser = new UAParser(ua);
    const browser = parser.getBrowser();
    const os = parser.getOS();

    // Nếu đã có deviceId → tìm trong DB
    if (deviceId) {
      const existing = await this.prisma.user_devices.findUnique({
        where: { device_id: deviceId },
      });
      if (existing && existing.user_id === userId) {
        // Update lastActiveAt, ipAddress
        return this.prisma.user_devices.update({
          where: { device_id: deviceId },
          data: { last_active_at: new Date(), ip_address: ip, active: true },
        });
      }
    }

    // Device mới → kiểm tra giới hạn
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    const activeCount = await this.prisma.user_devices.count({
      where: { user_id: userId, active: true },
    });
    if (activeCount >= (user?.max_devices ?? 3)) {
      throw new DeviceLimitExceededException();
    }

    const newDeviceId = deviceId || uuidv4();
    const defaultName = [browser.name, 'on', os.name].filter(Boolean).join(' ') || 'Unknown Device';

    return this.prisma.user_devices.create({
      data: {
        user_id: userId,
        device_id: newDeviceId,
        device_name: deviceName || defaultName,
        device_type: deviceType || 'unknown',
        browser: browser.name || null,
        browser_version: browser.version || null,
        operating_system: os.name || null,
        os_version: os.version || null,
        ip_address: ip || null,
        user_agent: ua || null,
        active: true,
        trusted: false,
        last_active_at: new Date(),
      },
    });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async getActiveDevices(userId: string) {
    return this.prisma.user_devices.findMany({
      where: { user_id: userId, active: true },
      orderBy: { last_active_at: 'desc' },
    });
  }

  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    const device = await this.prisma.user_devices.findFirst({
      where: { user_id: userId, device_id: deviceId, active: true },
    });
    return device?.trusted ?? false;
  }

  // ─── Trust / Untrust ───────────────────────────────────────────────────────

  async trustDevice(userId: string, deviceId: string) {
    await this.ensureDeviceBelongsToUser(userId, deviceId);
    return this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: deviceId },
      data: { trusted: true },
    });
  }

  async untrustDevice(userId: string, deviceId: string) {
    await this.ensureDeviceBelongsToUser(userId, deviceId);
    return this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: deviceId },
      data: { trusted: false },
    });
  }

  // ─── Rename ────────────────────────────────────────────────────────────────

  async renameDevice(userId: string, deviceId: string, newName: string) {
    await this.ensureDeviceBelongsToUser(userId, deviceId);
    return this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: deviceId },
      data: { device_name: newName },
    });
  }

  // ─── Deactivate ────────────────────────────────────────────────────────────

  async deactivateDevice(userId: string, deviceId: string) {
    await this.ensureDeviceBelongsToUser(userId, deviceId);
    return this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: deviceId },
      data: { active: false },
    });
  }

  async deactivateAllDevices(userId: string) {
    return this.prisma.user_devices.updateMany({
      where: { user_id: userId },
      data: { active: false },
    });
  }

  async deactivateOtherDevices(userId: string, currentDeviceId: string) {
    return this.prisma.user_devices.updateMany({
      where: { user_id: userId, device_id: { not: currentDeviceId } },
      data: { active: false },
    });
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  private async ensureDeviceBelongsToUser(userId: string, deviceId: string) {
    const device = await this.prisma.user_devices.findFirst({
      where: { device_id: deviceId, user_id: userId },
    });
    if (!device) {
      throw new Error('Device not found or does not belong to this user');
    }
    return device;
  }
}
