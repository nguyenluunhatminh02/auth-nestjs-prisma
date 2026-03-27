import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import {
  AccountLockedException,
  RateLimitExceededException,
} from '../../common/exceptions';

@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);
  private readonly maxAttempts: number;
  private readonly lockDurationSec: number;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.maxAttempts = config.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    this.lockDurationSec = config.get<number>('LOCKOUT_DURATION_MINUTES', 30) * 60;
  }

  // ─── Check trước khi login ─────────────────────────────────────────────────

  /**
   * Gọi TRƯỚC khi verify password.
   * Throw AccountLockedException nếu account đang bị lock.
   * Throw RateLimitExceededException nếu IP bị rate limit.
   */
  async checkBruteForce(email: string, ip: string): Promise<void> {
    // kiểm tra account lock
    const locked = await this.redis.get(`account_lock:${email}`);
    if (locked) {
      throw new AccountLockedException();
    }

    // kiểm tra IP rate limit: 50 lần/giờ
    const ipCount = await this.redis.get(`ip_attempts:${ip}`);
    if (ipCount && parseInt(ipCount, 10) >= 50) {
      throw new RateLimitExceededException('Too many login attempts from this IP');
    }
  }

  // ─── Ghi thất bại ─────────────────────────────────────────────────────────

  /**
   * Gọi khi login thất bại (sai password, user không tồn tại, v.v.)
   */
  async recordFailedLogin(
    email: string,
    ip: string,
    userId?: string,
    reason?: string,
  ): Promise<void> {
    // Ghi vào DB
    await this.prisma.login_attempts.create({
      data: {
        email,
        ip_address: ip,
        user_id: userId ?? null,
        success: false,
        failure_reason: reason ?? 'Unknown',
      },
    });

    // Tăng counter email
    const emailKey = `login_attempts:${email}`;
    const count = await this.redis.incr(emailKey);
    if (count === 1) await this.redis.expire(emailKey, 3600); // reset sau 1g

    // Tăng counter IP
    const ipKey = `ip_attempts:${ip}`;
    const ipCount = await this.redis.incr(ipKey);
    if (ipCount === 1) await this.redis.expire(ipKey, 3600);

    // Lock account nếu đủ số lần
    if (count >= this.maxAttempts) {
      await this.lockAccount(email);
    }
  }

  // ─── Ghi thành công ────────────────────────────────────────────────────────

  /**
   * Gọi khi login thành công — xóa counter.
   */
  async recordSuccessfulLogin(email: string, ip: string, userId: string): Promise<void> {
    await this.prisma.login_attempts.create({
      data: {
        email,
        ip_address: ip,
        user_id: userId,
        success: true,
      },
    });
    // Xóa counter thất bại
    await this.redis.del(`login_attempts:${email}`);
  }

  // ─── Lock account ──────────────────────────────────────────────────────────

  private async lockAccount(email: string): Promise<void> {
    // NX guard để tránh race condition — chỉ set nếu chưa có key
    const wasSet = await this.redis.setNx(`account_lock:${email}`, '1', this.lockDurationSec);
    if (!wasSet) return; // đã lock rồi

    const lockedUntil = new Date(Date.now() + this.lockDurationSec * 1000);
    await this.prisma.users.updateMany({
      where: { email },
      data: { is_locked: true, lock_time: lockedUntil },
    });

    // Gửi email thông báo
    const user = await this.prisma.users.findFirst({ where: { email } });
    if (user) {
      this.emailService
        .sendAccountLockedEmail(user.email, user.first_name)
        .catch(e => this.logger.warn(`Account locked email failed: ${e.message}`));
    }

    this.logger.warn(`Account locked: ${email} until ${lockedUntil.toISOString()}`);
  }

  // ─── Login History (paginated) ─────────────────────────────────────────────

  async getLoginHistory(
    userId: string,
    page = 1,
    size = 20,
  ): Promise<{ data: any[]; total: number; page: number; size: number }> {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000); // 90 ngày
    const skip = (page - 1) * size;

    const [data, total] = await Promise.all([
      this.prisma.login_attempts.findMany({
        where: { user_id: userId, attempted_at: { gte: since } },
        orderBy: { attempted_at: 'desc' },
        skip,
        take: size,
      }),
      this.prisma.login_attempts.count({
        where: { user_id: userId, attempted_at: { gte: since } },
      }),
    ]);

    return { data, total, page, size };
  }
}
