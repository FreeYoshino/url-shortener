import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import { UrlCacheEntry, UrlCacheService } from './url-cache.service';

describe('UrlCacheService', () => {
  let service: UrlCacheService;
  let warnSpy: jest.SpyInstance;

  // The cache service only uses `client`, so a plain object is enough. No real Redis connection is made in this suite.
  const redisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const mockRedisService = { client: redisClient } as unknown as RedisService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const shortCode = 'abc12345';
  const key = `url:${shortCode}`;
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');
  const entry: UrlCacheEntry = {
    id: 'url-id',
    originalUrl: 'https://example.com',
    shortCode,
    createdAt,
    updatedAt,
  };

  async function createService(ttlValue: string | undefined = '60000') {
    mockConfigService.get.mockReturnValue(ttlValue);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlCacheService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    return module.get<UrlCacheService>(UrlCacheService);
  }

  beforeEach(async () => {
    redisClient.get.mockReset().mockResolvedValue(null);
    redisClient.set.mockReset().mockResolvedValue('OK');
    redisClient.del.mockReset().mockResolvedValue(1);
    mockConfigService.get.mockReset();

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    service = await createService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return a cache hit with dates restored', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(entry));

      const result = await service.get(shortCode);

      expect(redisClient.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(entry);
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should return null on a cache miss', async () => {
      redisClient.get.mockResolvedValue(null);

      await expect(service.get(shortCode)).resolves.toBeNull();
      expect(redisClient.get).toHaveBeenCalledWith(key);
    });

    it('should return null and warn when the payload is not valid JSON', async () => {
      redisClient.get.mockResolvedValue('{not-json');

      await expect(service.get(shortCode)).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse cached data'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(shortCode));
    });

    it('should return null and warn when fields are missing or mistyped', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ ...entry, id: 123 }));

      await expect(service.get(shortCode)).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid fields'));
    });

    it('should return null and warn when the dates are invalid', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ ...entry, createdAt: 'not-a-date' }));

      await expect(service.get(shortCode)).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid date fields'));
    });

    it('should return null and warn when Redis fails (fail-open)', async () => {
      redisClient.get.mockRejectedValue(
        new AggregateError([new Error('connect ECONNREFUSED ::1:6379')], ''),
      );

      await expect(service.get(shortCode)).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        `Redis get error for shortCode ${shortCode}: connect ECONNREFUSED ::1:6379`,
      );
    });
  });

  describe('set', () => {
    it('should serialize the entry and set it with the configured TTL', async () => {
      await service.set(entry);

      expect(redisClient.set).toHaveBeenCalledWith(key, JSON.stringify(entry), 'PX', 60000);
    });

    it('should convert URL_CACHE_TTL_MS from a string', async () => {
      const customService = await createService('45000');

      await customService.set(entry);

      expect(redisClient.set).toHaveBeenCalledWith(key, JSON.stringify(entry), 'PX', 45000);
    });

    it('should fall back to 60000 when the configured TTL is invalid', async () => {
      const customService = await createService('abc');

      await customService.set(entry);

      expect(redisClient.set).toHaveBeenCalledWith(key, JSON.stringify(entry), 'PX', 60000);
    });

    it('should fall back to 60000 when the configured TTL is missing', async () => {
      const customService = await createService(undefined);

      await customService.set(entry);

      expect(redisClient.set).toHaveBeenCalledWith(key, JSON.stringify(entry), 'PX', 60000);
    });

    it('should swallow Redis errors and warn (fail-open)', async () => {
      redisClient.set.mockRejectedValue(new Error('boom'));

      await expect(service.set(entry)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(`Redis set error for shortCode ${shortCode}: boom`);
    });
  });

  describe('invalidate', () => {
    it('should delete the namespaced key', async () => {
      await service.invalidate(shortCode);

      expect(redisClient.del).toHaveBeenCalledWith(key);
    });

    it('should swallow Redis errors and warn (fail-open)', async () => {
      redisClient.del.mockRejectedValue(new Error('boom'));

      await expect(service.invalidate(shortCode)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        `Redis invalidate error for shortCode ${shortCode}: boom`,
      );
    });
  });

  describe('warning throttling', () => {
    it('should throttle repeated warnings of the same operation', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      redisClient.get.mockRejectedValue(new Error('down'));

      await service.get(shortCode);
      await service.get(shortCode);

      expect(warnSpy).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + UrlCacheService.ERROR_LOG_INTERVAL_MS);

      await service.get(shortCode);

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('should throttle each operation independently', async () => {
      redisClient.get.mockRejectedValue(new Error('down'));
      redisClient.set.mockRejectedValue(new Error('down'));

      await service.get(shortCode);
      await service.set(entry);

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });
});
