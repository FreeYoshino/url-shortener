import { Logger } from '@nestjs/common';
import { ThrottledLogger } from '../common/throttled-logger';
import { RedisService } from '../redis/redis.service';
import { RedisThrottlerStorage } from './redis-throttler-storage';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let warnSpy: jest.SpyInstance;

  const redisClient = {
    eval: jest.fn(),
  };
  const mockRedisService = {
    client: redisClient,
  } as unknown as RedisService;

  beforeEach(() => {
    redisClient.eval.mockReset();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    storage = new RedisThrottlerStorage(mockRedisService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call redis eval with namespaced keys and correct arguments', async () => {
    redisClient.eval.mockResolvedValue([5, 10, 0, 0]);

    await storage.increment('test-key', 60000, 30, 0, 'default');

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.any(String), // The Lua script
      2, // Number of keys
      'throttle:test-key',
      'throttle:block:test-key',
      60000,
      30,
      60000, // effectiveBlockDuration should equal ttl when blockDuration is 0
    );
  });

  it('should map an allowed result correctly', async () => {
    redisClient.eval.mockResolvedValue([5, 10, 0, 0]);

    const result = await storage.increment('test-key', 60000, 30, 0, 'default');

    expect(result).toEqual({
      totalHits: 5,
      timeToExpire: 10,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('should map a blocked result correctly', async () => {
    redisClient.eval.mockResolvedValue([31, 60, 1, 60]);

    const result = await storage.increment('hashed-key', 60_000, 30, 60_000, 'default');

    expect(result).toEqual({
      totalHits: 31,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('should fail open when redis is unavailable', async () => {
    redisClient.eval.mockRejectedValue(new Error('Redis is down'));

    const result = await storage.increment('test-key', 60000, 30, 0, 'default');

    expect(result).toEqual({
      totalHits: 0,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(warnSpy).toHaveBeenCalledWith('[default] Redis throttler storage error: Redis is down');
  });

  it('should round fail-open timeToExpire up to seconds', async () => {
    redisClient.eval.mockRejectedValue(new Error('down'));

    const result = await storage.increment('hashed-key', 1_500, 30, 1_500, 'default');

    expect(result.timeToExpire).toBe(2);
  });

  it('should throttle repeated fail-open warnings per throttler', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    redisClient.eval.mockRejectedValue(new Error('down'));

    await storage.increment('hashed-key', 60_000, 30, 60_000, 'default');
    await storage.increment('hashed-key', 60_000, 30, 60_000, 'default');

    expect(warnSpy).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_000_000 + ThrottledLogger.DEFAULT_INTERVAL_MS);

    await storage.increment('hashed-key', 60_000, 30, 60_000, 'default');

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
