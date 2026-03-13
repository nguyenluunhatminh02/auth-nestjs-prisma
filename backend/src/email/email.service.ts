import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private config: ConfigService,
  ) {
    const user = config.get<string>('email.user');
    const pass = config.get<string>('email.pass');
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('email.host'),
      port: config.get<number>('email.port'),
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const html = this.buildHtml({
      headerColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      title: `Welcome, ${this.esc(firstName)}!`,
      body: `<p>Thank you for creating an account. We're excited to have you on board!</p>`,
      ctaText: 'Start Shopping',
      ctaUrl: frontendUrl,
    });
    await this.send(to, 'Welcome to E-Commerce!', html);
  }

  async sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const link = `${frontendUrl}/verify-email?token=${token}`;
    const html = this.buildHtml({
      headerColor: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      title: 'Verify Your Email',
      body: `<p>Hi ${this.esc(firstName)},</p><p>Please click the button below to verify your email address. This link expires in 24 hours.</p>`,
      ctaText: 'Verify Email',
      ctaUrl: link,
    });
    await this.send(to, 'Verify your email', html);
  }

  async sendPasswordResetEmail(to: string, firstName: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const link = `${frontendUrl}/reset-password?token=${token}`;
    const html = this.buildHtml({
      headerColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      title: 'Reset Your Password',
      body: `<p>Hi ${this.esc(firstName)},</p><p>We received a request to reset your password. Click the button below to set a new password. This link expires in 60 minutes.</p><p style="color:#888;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>`,
      ctaText: 'Reset Password',
      ctaUrl: link,
    });
    await this.send(to, 'Reset your password', html);
  }

  async sendAccountLockedEmail(to: string, firstName: string): Promise<void> {
    const html = this.buildHtml({
      headerColor: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)',
      title: 'Account Locked',
      body: `<p>Hi ${this.esc(firstName)},</p><p>Your account has been temporarily locked due to multiple failed login attempts. It will be automatically unlocked after <strong>30 minutes</strong>.</p><p>If this wasn't you, we recommend changing your password immediately after your account is unlocked.</p>`,
    });
    await this.send(to, 'Account Locked - Security Alert', html);
  }

  async sendPasswordChangedEmail(to: string, firstName: string): Promise<void> {
    const html = this.buildHtml({
      headerColor: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      title: 'Password Changed',
      body: `<p>Hi ${this.esc(firstName)},</p><p>Your password has been successfully changed. If you didn't make this change, please contact support immediately.</p>`,
    });
    await this.send(to, 'Password Changed Successfully', html);
  }

  // ─── HTML Builder ─────────────────────────────────────────────────────────────

  private buildHtml(opts: {
    headerColor: string;
    title: string;
    body: string;
    ctaText?: string;
    ctaUrl?: string;
  }): string {
    const cta = opts.ctaText && opts.ctaUrl
      ? `<div style="text-align:center;margin:28px 0"><a href="${this.esc(opts.ctaUrl)}" style="background:${opts.headerColor};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block">${this.esc(opts.ctaText)}</a></div>`
      : '';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5"><div style="max-width:560px;margin:0 auto;padding:20px"><div style="background:${opts.headerColor};color:#fff;padding:32px;border-radius:12px 12px 0 0;text-align:center"><h1 style="margin:0;font-size:24px">${opts.title}</h1></div><div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">${opts.body}${cta}</div><p style="text-align:center;color:#999;font-size:12px;margin-top:20px">&copy; ${new Date().getFullYear()} E-Commerce. All rights reserved.</p></div></body></html>`;
  }

  private esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('email.from'),
        to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.warn(`Failed to send email to ${to}: ${err.message}`);
    }
  }
}
