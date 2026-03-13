import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { MfaSetupResponse } from '../dto/auth-response.dto';

@Injectable()
export class MfaService {
  constructor(private config: ConfigService) {}

  generateSecret(): string {
    return generateSecret();
  }

  async buildSetupResponse(email: string, secret: string): Promise<MfaSetupResponse> {
    const issuer = this.config.get<string>('mfa.issuer');
    const otpAuthUrl = generateURI({ issuer, label: email, secret });
    const qrCodeUri = await QRCode.toDataURL(otpAuthUrl);
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
    return { secret, qrCodeUri, backupCodes };
  }

  async verifyCode(secret: string, code: string): Promise<boolean> {
    try {
      const result = await otpVerify({ token: code, secret });
      return result.valid === true;
    } catch {
      return false;
    }
  }
}
