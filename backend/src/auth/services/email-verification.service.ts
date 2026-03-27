import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { EMAIL_VERIFICATION_EXPIRY_MS } from '../../common/constants/auth.constants';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.users.findFirst({
      where: { email_verification_token: tokenHash },
    });
    if (!user) throw new BadRequestException('Invalid verification token');
    if (!user.email_verification_expiry || new Date() > user.email_verification_expiry)
      throw new BadRequestException('Verification token expired');

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verification_token: null,
        email_verification_expiry: null,
      },
    });
    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) return { message: 'If that email exists, a verification link was sent.' };
    if (user.email_verified) throw new BadRequestException('Email already verified');

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        email_verification_token: tokenHash,
        email_verification_expiry: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS),
      },
    });
    await this.emailService.sendVerificationEmail(user.email, user.first_name, token);
    return { message: 'Verification email sent.' };
  }
}
