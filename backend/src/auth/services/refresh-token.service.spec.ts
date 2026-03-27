import { Test, TestingModule } from '@nestjs/testing';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const mockPrisma = {
    refresh_tokens: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockUser = { id: 'user-123', email: 'test@example.com' } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createRefreshToken', () => {
    it('creates a new refresh token', async () => {
      mockPrisma.refresh_tokens.findMany.mockResolvedValue([]); // no active sessions
      mockPrisma.refresh_tokens.create.mockResolvedValue({ id: 'rt-1', token: 'abc123' });

      const result = await service.createRefreshToken(mockUser, 7, 'Chrome', '127.0.0.1', 'Mozilla');

      expect(mockPrisma.refresh_tokens.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: mockUser.id,
            ip_address: '127.0.0.1',
            device_info: 'Chrome',
            user_agent: 'Mozilla',
          }),
        }),
      );
      expect(result).toEqual({ id: 'rt-1', token: 'abc123' });
    });

    it('evicts oldest session when max sessions reached', async () => {
      const activeSessions = [
        { id: 'rt-old', created_at: new Date('2024-01-01') },
        { id: 'rt-mid', created_at: new Date('2024-01-02') },
        { id: 'rt-new', created_at: new Date('2024-01-03') },
      ];
      mockPrisma.refresh_tokens.findMany.mockResolvedValue(activeSessions);
      mockPrisma.refresh_tokens.update.mockResolvedValue({});
      mockPrisma.refresh_tokens.create.mockResolvedValue({ id: 'rt-newest' });

      await service.createRefreshToken(mockUser, 7);

      expect(mockPrisma.refresh_tokens.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt-old' }, data: { is_revoked: true } }),
      );
    });
  });

  describe('findValid', () => {
    it('returns token record when found and not revoked', async () => {
      const rt = { id: 'rt-1', token: 'tok', is_revoked: false, users: { id: 'user-123' } };
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(rt);

      const result = await service.findValid('tok');

      expect(result).toBe(rt);
      expect(mockPrisma.refresh_tokens.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: 'tok', is_revoked: false } }),
      );
    });

    it('returns null for an unknown or revoked token', async () => {
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(null);
      expect(await service.findValid('bad')).toBeNull();
    });
  });

  describe('revoke', () => {
    it('marks matching token as revoked', async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });

      await service.revoke('token-to-revoke');

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { token: 'token-to-revoke' },
        data: { is_revoked: true },
      });
    });
  });

  describe('revokeById', () => {
    const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('returns true and revokes when session belongs to user', async () => {
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue({ id: VALID_UUID });
      mockPrisma.refresh_tokens.update.mockResolvedValue({});

      const result = await service.revokeById(VALID_UUID, 'user-123');

      expect(result).toBe(true);
      expect(mockPrisma.refresh_tokens.update).toHaveBeenCalledWith({
        where: { id: VALID_UUID },
        data: { is_revoked: true },
      });
    });

    it('returns false when session not found for user', async () => {
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(null);
      expect(await service.revokeById(VALID_UUID, 'user-123')).toBe(false);
    });

    it('returns false for a non-UUID id (guard rejects early)', async () => {
      expect(await service.revokeById('not-a-uuid', 'user-123')).toBe(false);
      expect(mockPrisma.refresh_tokens.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all active tokens for user', async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 3 });

      await service.revokeAllForUser('user-123');

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-123', is_revoked: false },
        data: { is_revoked: true },
      });
    });
  });

  describe('findActiveByUserId', () => {
    it('returns active sessions for user', async () => {
      const sessions = [{ id: 'rt-1' }, { id: 'rt-2' }];
      mockPrisma.refresh_tokens.findMany.mockResolvedValue(sessions);

      const result = await service.findActiveByUserId('user-123');

      expect(result).toEqual(sessions);
      expect(mockPrisma.refresh_tokens.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 'user-123', is_revoked: false } }),
      );
    });
  });

  describe('updateLastActive', () => {
    it('updates last_active_at for the token', async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });

      await service.updateLastActive('some-token');

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: 'some-token' },
          data: expect.objectContaining({ last_active_at: expect.any(Date) }),
        }),
      );
    });
  });

  describe('removeExpired', () => {
    it('deletes tokens past their expiry date', async () => {
      mockPrisma.refresh_tokens.deleteMany.mockResolvedValue({ count: 5 });

      await service.removeExpired();

      expect(mockPrisma.refresh_tokens.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { expires_at: { lt: expect.any(Date) } } }),
      );
    });
  });

  describe('rotateToken', () => {
    it('revokes old token and creates a new one', async () => {
      const oldRt = {
        id: 'rt-old',
        token: 'old-token',
        user_id: 'user-123',
        device_info: null,
        ip_address: null,
        user_agent: null,
        expires_at: new Date(Date.now() + 86_400_000),
      };
      const txMock = {
        refresh_tokens: {
          findFirst: jest.fn().mockResolvedValue(oldRt),
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({ id: 'rt-new', token: 'new-token' }),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      const result = await service.rotateToken('old-token', 7);

      expect(txMock.refresh_tokens.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: 'old-token', is_revoked: false } }),
      );
      expect(txMock.refresh_tokens.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt-old' }, data: { is_revoked: true } }),
      );
      expect(result).toEqual({ id: 'rt-new', token: 'new-token' });
    });

    it('throws error when old token is invalid', async () => {
      const txMock = {
        refresh_tokens: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      await expect(service.rotateToken('bad-token')).rejects.toThrow('Invalid or expired refresh token');
    });
  });
});
