import { Test, TestingModule } from '@nestjs/testing';
import { TokenBlacklistService } from './token-blacklist.service';
import { RedisService } from '../../common/services/redis.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;

  const mockRedis = {
    isAvailable: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks before each test, then set default behaviors
    jest.resetAllMocks();
    mockRedis.isAvailable.mockReturnValue(true);
    mockRedis.set.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  describe('addToBlacklist', () => {
    it('stores token in Redis with TTL', async () => {
      await service.addToBlacklist('my.jwt.token', 900);
      expect(mockRedis.set).toHaveBeenCalledWith('blacklist:my.jwt.token', '1', 900);
    });

    it('skips blacklisting when Redis is unavailable', async () => {
      mockRedis.isAvailable.mockReturnValue(false);
      await service.addToBlacklist('token', 900);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('isBlacklisted', () => {
    it('returns true for a blacklisted token', async () => {
      mockRedis.exists.mockResolvedValue(true);
      expect(await service.isBlacklisted('blacklisted.token')).toBe(true);
    });

    it('returns false for a non-blacklisted token', async () => {
      mockRedis.exists.mockResolvedValue(false);
      expect(await service.isBlacklisted('clean.token')).toBe(false);
    });

    it('returns false when Redis is unavailable (fail-open)', async () => {
      mockRedis.isAvailable.mockReturnValue(false);
      expect(await service.isBlacklisted('any-token')).toBe(false);
      expect(mockRedis.exists).not.toHaveBeenCalled();
    });
  });

  describe('removeFromBlacklist', () => {
    it('deletes the token key from Redis', async () => {
      await service.removeFromBlacklist('some.token');
      expect(mockRedis.del).toHaveBeenCalledWith('blacklist:some.token');
    });

    it('skips when Redis is unavailable', async () => {
      mockRedis.isAvailable.mockReturnValue(false);
      await service.removeFromBlacklist('token');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('blacklistAllUserTokens', () => {
    it('stores user-level blacklist marker in Redis for 24h', async () => {
      await service.blacklistAllUserTokens('user-123');
      expect(mockRedis.set).toHaveBeenCalledWith('blacklist:user:user-123', '1', 86400);
    });

    it('skips when Redis is unavailable', async () => {
      mockRedis.isAvailable.mockReturnValue(false);
      await service.blacklistAllUserTokens('user-123');
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('areAllUserTokensBlacklisted', () => {
    it('returns true when user-level blacklist marker exists', async () => {
      mockRedis.exists.mockResolvedValue(true);
      expect(await service.areAllUserTokensBlacklisted('user-123')).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('blacklist:user:user-123');
    });

    it('returns false when no user-level marker exists', async () => {
      mockRedis.exists.mockResolvedValue(false);
      expect(await service.areAllUserTokensBlacklisted('user-123')).toBe(false);
    });
  });

  describe('clearUserBlacklist', () => {
    it('removes the user-level blacklist marker', async () => {
      await service.clearUserBlacklist('user-123');
      expect(mockRedis.del).toHaveBeenCalledWith('blacklist:user:user-123');
    });
  });
});
