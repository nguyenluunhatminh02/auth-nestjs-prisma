import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MfaService } from './mfa.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';

// Mock external modules
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('GENERATED_SECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/test'),
  verify: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock-qr'),
}));

import { generateSecret, generateURI, verify as otpVerify } from 'otplib';

const mockGenerateSecret = generateSecret as jest.Mock;
const mockOtpVerify = otpVerify as jest.Mock;

describe('MfaService', () => {
  let service: MfaService;

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'mfa.issuer') return 'TestApp';
      return null;
    }),
  };

  const mockPrisma = {
    users: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAuditLog = {
    recordLoginHistory: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateSecret', () => {
    it('returns a TOTP secret string', () => {
      const secret = service.generateSecret();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
    });
  });

  describe('buildSetupResponse', () => {
    it('returns secret, qrCodeUri, and 8 backup codes', async () => {
      const result = await service.buildSetupResponse('test@example.com', 'MY_SECRET');

      expect(result.secret).toBe('MY_SECRET');
      expect(result.qrCodeUri).toBe('data:image/png;base64,mock-qr');
      expect(result.backupCodes).toHaveLength(8);
      expect(result.backupCodes[0]).toMatch(/^[A-F0-9]{10}$/);
    });

    it('uses issuer from config when building OTP URI', async () => {
      await service.buildSetupResponse('user@example.com', 'SECRET');
      expect(generateURI).toHaveBeenCalledWith(
        expect.objectContaining({ issuer: 'TestApp', label: 'user@example.com', secret: 'SECRET' }),
      );
    });
  });

  describe('verifyCode', () => {
    it('returns true for a valid TOTP code', async () => {
      mockOtpVerify.mockReturnValue({ valid: true });
      const result = await service.verifyCode('MY_SECRET', '123456');
      expect(result).toBe(true);
    });

    it('returns false for an invalid TOTP code', async () => {
      mockOtpVerify.mockReturnValue({ valid: false });
      const result = await service.verifyCode('MY_SECRET', '000000');
      expect(result).toBe(false);
    });

    it('returns false when otplib throws an error', async () => {
      mockOtpVerify.mockImplementation(() => { throw new Error('TOTP error'); });
      const result = await service.verifyCode('SECRET', '123456');
      expect(result).toBe(false);
    });
  });
});
