import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PasswordHistoryService } from './password-history.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PasswordHistoryService', () => {
  let service: PasswordHistoryService;

  const mockPrisma = {
    password_history: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string, def: any) => {
      if (key === 'PASSWORD_HISTORY_LIMIT') return 5;
      return def;
    }),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.password_history.create.mockResolvedValue({ id: 'ph-1' });
    mockPrisma.password_history.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.password_history.count.mockResolvedValue(0);
    mockConfig.get.mockImplementation((key: string, def: any) => {
      if (key === 'PASSWORD_HISTORY_LIMIT') return 5;
      return def;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordHistoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PasswordHistoryService>(PasswordHistoryService);
  });

  describe('isPasswordReused', () => {
    it('returns false when password history is empty', async () => {
      mockPrisma.password_history.findMany.mockResolvedValue([]);
      expect(await service.isPasswordReused('user-123', 'NewPass1!')).toBe(false);
    });

    it('returns true when the new password matches one in history', async () => {
      const oldHash = await bcrypt.hash('OldPass123!', 10);
      mockPrisma.password_history.findMany.mockResolvedValue([
        { id: 'ph-1', password_hash: oldHash },
      ]);
      expect(await service.isPasswordReused('user-123', 'OldPass123!')).toBe(true);
    });

    it('returns false when the new password does not match history', async () => {
      const otherHash = await bcrypt.hash('DifferentPass1!', 10);
      mockPrisma.password_history.findMany.mockResolvedValue([
        { id: 'ph-1', password_hash: otherHash },
      ]);
      expect(await service.isPasswordReused('user-123', 'NewPass123!')).toBe(false);
    });

    it('returns false (fail-open) when Prisma throws', async () => {
      mockPrisma.password_history.findMany.mockRejectedValue(new Error('DB error'));
      expect(await service.isPasswordReused('user-123', 'Any1!')).toBe(false);
    });
  });

  describe('addPasswordToHistory', () => {
    it('creates a new history entry', async () => {
      // count returns 2 — below limit, no cleanup
      mockPrisma.password_history.count.mockResolvedValue(2);

      await service.addPasswordToHistory('user-123', 'hashed-pw');

      expect(mockPrisma.password_history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user_id: 'user-123', password_hash: 'hashed-pw' }),
        }),
      );
      expect(mockPrisma.password_history.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes oldest entries when history exceeds the limit', async () => {
      // count returns 6 (over limit of 5) → cleanup runs
      mockPrisma.password_history.count.mockResolvedValue(6);
      // cleanup findMany returns the 5 newest IDs (ordered desc by created_at)
      const keepIds = [
        { id: 'ph-5' }, { id: 'ph-4' }, { id: 'ph-3' }, { id: 'ph-2' }, { id: 'ph-1' },
      ];
      mockPrisma.password_history.findMany.mockResolvedValue(keepIds);

      await service.addPasswordToHistory('user-123', 'hashed-pw');

      // Service does: deleteMany where id NOT IN keepIds → deletes ph-0
      expect(mockPrisma.password_history.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: 'user-123',
            id: { notIn: expect.arrayContaining(['ph-5', 'ph-4', 'ph-3', 'ph-2', 'ph-1']) },
          }),
        }),
      );
    });

    it('does not throw when Prisma fails', async () => {
      mockPrisma.password_history.create.mockRejectedValue(new Error('DB error'));
      await expect(service.addPasswordToHistory('user-123', 'hash')).resolves.not.toThrow();
    });
  });

  describe('getPasswordHistory', () => {
    it('returns history sorted by date descending, limited to HISTORY_LIMIT', async () => {
      const history = [{ id: 'ph-1', password_hash: 'h1', created_at: new Date() }];
      mockPrisma.password_history.findMany.mockResolvedValue(history);

      const result = await service.getPasswordHistory('user-123');

      expect(result).toEqual(history);
      expect(mockPrisma.password_history.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-123' },
          orderBy: { created_at: 'desc' },
          take: 5,
        }),
      );
    });

    it('returns empty array when Prisma throws', async () => {
      mockPrisma.password_history.findMany.mockRejectedValue(new Error('DB error'));
      expect(await service.getPasswordHistory('user-123')).toEqual([]);
    });
  });

  describe('clearPasswordHistory', () => {
    it('deletes all history entries for the user', async () => {
      await service.clearPasswordHistory('user-123');
      expect(mockPrisma.password_history.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-123' },
      });
    });

    it('does not throw when Prisma fails', async () => {
      mockPrisma.password_history.deleteMany.mockRejectedValue(new Error('DB error'));
      await expect(service.clearPasswordHistory('user-123')).resolves.not.toThrow();
    });
  });
});
