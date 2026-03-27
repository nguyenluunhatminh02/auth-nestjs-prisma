// @ts-nocheck
/**
 * AuthService Unit Tests
 *
 * AuthService is a facade that delegates most operations to dedicated sub-services.
 * Tests cover:
 *  - Direct logic in AuthService: register, login, validateMfaLogin, refreshToken
 *  - Delegation tests for all delegated methods (verifyEmail, password ops, MFA, sessions)
 *
 * ESM modules (otplib, qrcode) are mocked at module level.
 */
jest.mock("otplib", () => ({
  generateSecret: jest.fn().mockReturnValue("MOCK_SECRET"),
  generateURI: jest.fn().mockReturnValue("otpauth://totp/mock"),
  verify: jest.fn().mockReturnValue({ valid: true }),
}));
jest.mock("qrcode", () => ({ toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,qr") }));

import { Test, TestingModule } from "@nestjs/testing";
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RefreshTokenService } from "./refresh-token.service";
import { MfaService } from "./mfa.service";
import { TokenBlacklistService } from "./token-blacklist.service";
import { RedisService } from "../../common/services/redis.service";
import { EmailService } from "../../email/email.service";
import { SessionService } from "./session.service";
import { EmailVerificationService } from "./email-verification.service";
import { PasswordService } from "./password.service";
import { AuditLogService } from "../../common/services/audit-log.service";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const mockReq = (overrides: any = {}) =>
  ({ headers: {}, socket: { remoteAddress: "127.0.0.1" }, get: jest.fn(), ...overrides } as any);

const makeDbUser = (o: any = {}) => ({
  id: "user-123",
  email: "john@example.com",
  first_name: "John",
  last_name: "Doe",
  password: null,
  provider: "LOCAL",
  is_active: true,
  is_locked: false,
  is_deleted: false,
  email_verified: true,
  email_verification_token: null,
  email_verification_expiry: null,
  password_reset_token: null,
  password_reset_expiry: null,
  two_factor_enabled: false,
  two_factor_secret: null,
  mfa_backup_codes: [],
  failed_login_attempts: 0,
  lock_time: null,
  last_login_at: null,
  last_login_ip: null,
  deleted_at: null,
  delete_status: "ACTIVE",
  delete_requested_at: null,
  language: "en",
  timezone: "UTC",
  notification_email_enabled: true,
  notification_push_enabled: true,
  notification_in_app_enabled: true,
  notification_security_enabled: true,
  notification_order_enabled: true,
  notification_promotion_enabled: false,
  profile_public: false,
  show_email: false,
  show_phone: false,
  show_activity_status: true,
  avatar_url: null,
  date_of_birth: null,
  gender: null,
  phone: null,
  provider_id: null,
  fcm_token: null,
  created_at: new Date("2024-01-01"),
  updated_at: new Date("2024-01-01"),
  user_roles: [],
  ...o,
});

const makeAppUser = (o: any = {}) => ({
  id: "user-123",
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  password: null,
  provider: "LOCAL",
  isActive: true,
  isLocked: false,
  isDeleted: false,
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  failedLoginAttempts: 0,
  lockTime: null,
  deleteStatus: "ACTIVE",
  roles: [],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...o,
});

const MOCK_AUTH_RESPONSE = {
  accessToken: "mock.access.token",
  refreshToken: "mock.refresh.token",
  mfaRequired: false,
  user: { id: "user-123" },
};

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe("AuthService", () => {
  let service: AuthService;

  const mockPrisma = {
    users: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    login_history: { create: jest.fn().mockResolvedValue({}) },
    refresh_tokens: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue("mock.access.token"),
    decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 900 }),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue(null),
  };

  const mockRt = {
    createRefreshToken: jest.fn().mockResolvedValue({ id: "rt-1", token: "mock.refresh.token" }),
    findValid: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    revokeById: jest.fn(),
    rotateToken: jest.fn().mockResolvedValue({ id: "rt-2", token: "new.refresh.token" }),
    updateLastActive: jest.fn().mockResolvedValue(undefined),
  };

  const mockMfa = {
    generateSecret: jest.fn().mockReturnValue("TOTP_SECRET"),
    buildSetupResponse: jest.fn().mockResolvedValue({ secret: "S", qrCodeUri: "qr", backupCodes: [] }),
    verifyCode: jest.fn(),
    verifyCodeOrBackup: jest.fn(),
    setupMfa: jest.fn(),
    verifyAndEnableMfa: jest.fn(),
    disableMfa: jest.fn(),
  };

  const mockBlacklist = {
    addToBlacklist: jest.fn().mockResolvedValue(undefined),
    isBlacklisted: jest.fn().mockResolvedValue(false),
    clearUserBlacklist: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedis = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockEmail = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockSession = {
    buildAuthResponse: jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    buildAuthResponseWithRefreshToken: jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    logout: jest.fn().mockResolvedValue(undefined),
    logoutAll: jest.fn().mockResolvedValue(undefined),
    logoutSession: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    cancelDeleteAccount: jest.fn().mockResolvedValue(undefined),
  };

  const mockEmailVerification = {
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
  };

  const mockPasswordService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
  };

  const mockAuditLog = {
    recordLoginHistory: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RefreshTokenService, useValue: mockRt },
        { provide: MfaService, useValue: mockMfa },
        { provide: TokenBlacklistService, useValue: mockBlacklist },
        { provide: RedisService, useValue: mockRedis },
        { provide: EmailService, useValue: mockEmail },
        { provide: SessionService, useValue: mockSession },
        { provide: EmailVerificationService, useValue: mockEmailVerification },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── register ────────────────────────────────────────────────────────────────

  describe("register", () => {
    const dto = { firstName: "John", lastName: "Doe", email: "john@example.com", password: "Password123!" };

    it("creates user and returns tokens", async () => {
      mockPrisma.users.create.mockResolvedValue(makeDbUser());

      const result = await service.register(dto, mockReq());

      expect(result).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), mfaRequired: false });
      expect(mockSession.buildAuthResponse).toHaveBeenCalled();
    });

    it("sends welcome and verification emails asynchronously", async () => {
      mockPrisma.users.create.mockResolvedValue(makeDbUser());

      await service.register(dto, mockReq());
      await new Promise(r => setTimeout(r, 20));

      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith("john@example.com", "John", expect.any(String));
      expect(mockEmail.sendWelcomeEmail).toHaveBeenCalledWith("john@example.com", "John");
    });

    it("throws ConflictException when email already in use (prisma P2002)", async () => {
      const p2002 = Object.assign(new Error("Unique"), { code: "P2002" });
      mockPrisma.users.create.mockRejectedValue(p2002);
      await expect(service.register(dto, mockReq())).rejects.toThrow(ConflictException);
    });
  });

  // ─── verifyEmail (delegates) ──────────────────────────────────────────────────

  describe("verifyEmail", () => {
    it("delegates to emailVerificationService.verifyEmail", async () => {
      const expected = { message: "Email verified successfully" };
      mockEmailVerification.verifyEmail.mockResolvedValue(expected);

      const result = await service.verifyEmail("tok");

      expect(mockEmailVerification.verifyEmail).toHaveBeenCalledWith("tok");
      expect(result).toEqual(expected);
    });

    it("propagates BadRequestException for invalid token", async () => {
      mockEmailVerification.verifyEmail.mockRejectedValue(new BadRequestException("Invalid"));
      await expect(service.verifyEmail("bad")).rejects.toThrow(BadRequestException);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe("login", () => {
    const rawPw = "Password123!";
    let hashed: string;
    beforeAll(async () => { hashed = await bcrypt.hash(rawPw, 10); });

    it("returns tokens for valid credentials", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser({ password: hashed }));
      mockPrisma.users.update.mockResolvedValue({});

      const result = await service.login({ email: "john@example.com", password: rawPw }, mockReq());

      expect(result).toMatchObject({ accessToken: expect.any(String), mfaRequired: false });
      expect(mockSession.buildAuthResponse).toHaveBeenCalled();
    });

    it("throws UnauthorizedException for unknown user", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null);
      await expect(service.login({ email: "x@x.com", password: rawPw }, mockReq())).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for wrong password", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser({ password: hashed }));
      mockPrisma.users.update.mockResolvedValue({});
      await expect(service.login({ email: "john@example.com", password: "WrongPass1!" }, mockReq())).rejects.toThrow(UnauthorizedException);
    });

    it("returns mfaRequired=true when 2FA enabled", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser({ password: hashed, two_factor_enabled: true }));

      const result = await service.login({ email: "john@example.com", password: rawPw }, mockReq());

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaTempToken).toMatch(/[a-f0-9]{64}/);
    });

    it("locks account after max failed attempts", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser({ password: hashed, failed_login_attempts: 4 }));
      mockPrisma.users.update.mockResolvedValue({});

      await expect(service.login({ email: "john@example.com", password: "WrongPass1!" }, mockReq())).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ is_locked: true, failed_login_attempts: 5 }) }),
      );
    });

    it("throws UnauthorizedException for locked account within lock period", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser({ password: hashed, is_locked: true, lock_time: new Date() }));
      await expect(service.login({ email: "john@example.com", password: rawPw }, mockReq())).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for inactive account", async () => {
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser({ password: hashed, is_active: false }));
      mockPrisma.users.update.mockResolvedValue({});
      await expect(service.login({ email: "john@example.com", password: rawPw }, mockReq())).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── validateMfaLogin ────────────────────────────────────────────────────────

  describe("validateMfaLogin", () => {
    it("returns tokens after valid MFA code via verifyCodeOrBackup", async () => {
      mockRedis.get.mockResolvedValue("user-123");
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser());
      mockPrisma.users.update.mockResolvedValue({});
      mockMfa.verifyCodeOrBackup.mockResolvedValue(true);

      const result = await service.validateMfaLogin({ mfaTempToken: "tmp", code: "123456" }, mockReq());

      expect(result).toHaveProperty("accessToken");
      expect(mockRedis.del).toHaveBeenCalledWith("mfa_temp:tmp");
      expect(mockMfa.verifyCodeOrBackup).toHaveBeenCalled();
    });

    it("throws UnauthorizedException when temp token expired", async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(service.validateMfaLogin({ mfaTempToken: "bad", code: "000000" }, mockReq())).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for wrong TOTP code", async () => {
      mockRedis.get.mockResolvedValue("user-123");
      mockPrisma.users.findFirst.mockResolvedValue(makeDbUser());
      mockMfa.verifyCodeOrBackup.mockResolvedValue(false);
      await expect(service.validateMfaLogin({ mfaTempToken: "tmp", code: "999999" }, mockReq())).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── refreshToken ─────────────────────────────────────────────────────────────

  describe("refreshToken", () => {
    it("rotates tokens for valid non-expired refresh token", async () => {
      const user = makeDbUser();
      mockRt.findValid.mockResolvedValue({
        id: "rt-1", token: "valid-rt",
        expires_at: new Date(Date.now() + 86_400_000),
        users: { ...user, is_active: true, is_deleted: false, user_roles: [] },
      });

      const result = await service.refreshToken("valid-rt", mockReq());

      expect(result).toHaveProperty("accessToken");
      expect(mockRt.rotateToken).toHaveBeenCalledWith("valid-rt");
    });

    it("throws UnauthorizedException for invalid refresh token", async () => {
      mockRt.findValid.mockResolvedValue(null);
      await expect(service.refreshToken("bad", mockReq())).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for expired token", async () => {
      mockRt.findValid.mockResolvedValue({ expires_at: new Date(Date.now() - 1), users: { is_active: true } });
      await expect(service.refreshToken("expired", mockReq())).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when account deactivated", async () => {
      mockRt.findValid.mockResolvedValue({
        expires_at: new Date(Date.now() + 86_400_000),
        users: { is_active: false, is_deleted: false },
      });
      await expect(service.refreshToken("rt", mockReq())).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout (delegates) ──────────────────────────────────────────────────────

  describe("logout", () => {
    it("delegates to sessionService.logout", async () => {
      const user = makeAppUser();
      await service.logout("at", "rt", user as any, mockReq());
      expect(mockSession.logout).toHaveBeenCalledWith("at", "rt", user, expect.any(Object));
    });
  });

  describe("logoutAll", () => {
    it("delegates to sessionService.logoutAll", async () => {
      const user = makeAppUser();
      await service.logoutAll("at", user as any, mockReq());
      expect(mockSession.logoutAll).toHaveBeenCalledWith("at", user, expect.any(Object));
    });
  });

  describe("logoutSession", () => {
    it("delegates to sessionService.logoutSession", async () => {
      const user = makeAppUser();
      await service.logoutSession("at", "sid", user as any, mockReq());
      expect(mockSession.logoutSession).toHaveBeenCalledWith("at", "sid", user, expect.any(Object));
    });

    it("propagates NotFoundException for unknown session", async () => {
      mockSession.logoutSession.mockRejectedValue(new NotFoundException("Session not found"));
      await expect(service.logoutSession("at", "unknown", makeAppUser() as any, mockReq())).rejects.toThrow(NotFoundException);
    });
  });

  // ─── forgotPassword (delegates) ──────────────────────────────────────────────

  describe("forgotPassword", () => {
    it("delegates to passwordService.forgotPassword", async () => {
      const dto = { email: "john@example.com" };
      const expected = { message: "Password reset email sent." };
      mockPasswordService.forgotPassword.mockResolvedValue(expected);

      const result = await service.forgotPassword(dto);

      expect(mockPasswordService.forgotPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  // ─── resetPassword (delegates) ───────────────────────────────────────────────

  describe("resetPassword", () => {
    it("delegates to passwordService.resetPassword", async () => {
      const dto = { token: "valid", newPassword: "NewPass1!" };
      const expected = { message: "Password reset successful" };
      mockPasswordService.resetPassword.mockResolvedValue(expected);

      const result = await service.resetPassword(dto);

      expect(mockPasswordService.resetPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it("propagates BadRequestException for invalid token", async () => {
      mockPasswordService.resetPassword.mockRejectedValue(new BadRequestException("Invalid or expired reset token"));
      await expect(service.resetPassword({ token: "bad", newPassword: "NewPass1!" })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── changePassword (delegates) ──────────────────────────────────────────────

  describe("changePassword", () => {
    it("delegates to passwordService.changePassword", async () => {
      const dto = { currentPassword: "OldPass1!", newPassword: "NewPass1!" };
      const user = makeAppUser();
      const req = mockReq();
      const expected = { message: "Password changed successfully. Please log in again." };
      mockPasswordService.changePassword.mockResolvedValue(expected);

      const result = await service.changePassword(dto, user as any, req);

      expect(mockPasswordService.changePassword).toHaveBeenCalledWith(dto, user, req);
      expect(result).toEqual(expected);
    });

    it("propagates BadRequestException for wrong current password", async () => {
      mockPasswordService.changePassword.mockRejectedValue(new BadRequestException("Current password incorrect"));
      await expect(
        service.changePassword({ currentPassword: "Wrong!", newPassword: "New1!" }, makeAppUser() as any, mockReq()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── setupMfa (delegates) ────────────────────────────────────────────────────

  describe("setupMfa", () => {
    it("delegates to mfaService.setupMfa", async () => {
      const user = makeAppUser();
      const expected = { secret: "S", qrCodeUri: "qr", backupCodes: ["A", "B"] };
      mockMfa.setupMfa.mockResolvedValue(expected);

      const result = await service.setupMfa(user as any);

      expect(mockMfa.setupMfa).toHaveBeenCalledWith(user);
      expect(result).toEqual(expected);
    });

    it("propagates BadRequestException if MFA already enabled", async () => {
      mockMfa.setupMfa.mockRejectedValue(new BadRequestException("MFA is already enabled"));
      await expect(service.setupMfa(makeAppUser({ twoFactorEnabled: true }) as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── verifyAndEnableMfa (delegates) ─────────────────────────────────────────

  describe("verifyAndEnableMfa", () => {
    it("delegates to mfaService.verifyAndEnableMfa", async () => {
      const dto = { code: "123456" };
      const user = makeAppUser();
      const req = mockReq();
      const expected = { message: "Two-factor authentication enabled" };
      mockMfa.verifyAndEnableMfa.mockResolvedValue(expected);

      const result = await service.verifyAndEnableMfa(dto, user as any, req);

      expect(mockMfa.verifyAndEnableMfa).toHaveBeenCalledWith(dto, user, req);
      expect(result).toEqual(expected);
    });

    it("propagates BadRequestException for invalid code", async () => {
      mockMfa.verifyAndEnableMfa.mockRejectedValue(new BadRequestException("Invalid MFA code"));
      await expect(service.verifyAndEnableMfa({ code: "000" }, makeAppUser() as any, mockReq())).rejects.toThrow(BadRequestException);
    });
  });

  // ─── disableMfa (delegates) ──────────────────────────────────────────────────

  describe("disableMfa", () => {
    it("delegates to mfaService.disableMfa", async () => {
      const dto = { code: "123456" };
      const user = makeAppUser();
      const req = mockReq();
      const expected = { message: "Two-factor authentication disabled" };
      mockMfa.disableMfa.mockResolvedValue(expected);

      const result = await service.disableMfa(dto, user as any, req);

      expect(mockMfa.disableMfa).toHaveBeenCalledWith(dto, user, req);
      expect(result).toEqual(expected);
    });

    it("propagates BadRequestException if MFA not enabled", async () => {
      mockMfa.disableMfa.mockRejectedValue(new BadRequestException("MFA is not enabled"));
      await expect(service.disableMfa({ code: "000" }, makeAppUser() as any, mockReq())).rejects.toThrow(BadRequestException);
    });
  });

  // ─── deleteAccount (delegates) ────────────────────────────────────────────────

  describe("deleteAccount", () => {
    it("delegates to sessionService.deleteAccount", async () => {
      const user = makeAppUser();
      const req = mockReq();
      await service.deleteAccount(user as any, "at", req);
      expect(mockSession.deleteAccount).toHaveBeenCalledWith(user, "at", req);
    });
  });

  // ─── cancelDeleteAccount (delegates) ─────────────────────────────────────────

  describe("cancelDeleteAccount", () => {
    it("delegates to sessionService.cancelDeleteAccount", async () => {
      const user = makeAppUser({ deleteStatus: "DELETE_REQUESTED" });
      await service.cancelDeleteAccount(user as any);
      expect(mockSession.cancelDeleteAccount).toHaveBeenCalledWith(user);
    });

    it("propagates BadRequestException when no pending delete request", async () => {
      mockSession.cancelDeleteAccount.mockRejectedValue(new BadRequestException("No pending delete request"));
      await expect(service.cancelDeleteAccount(makeAppUser() as any)).rejects.toThrow(BadRequestException);
    });
  });
});
