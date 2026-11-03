import type { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

// The real client is not needed here: RedisService only wires lifecycle eventsand logging around it. The mock is an EventEmitter so the tests can drive the same events ioredis emits.
jest.mock('ioredis', () => {
  const { EventEmitter: NodeEventEmitter } =
    jest.requireActual<typeof import('node:events')>('node:events');

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      const client = new NodeEventEmitter() as EventEmitter & {
        connect: jest.Mock;
        disconnect: jest.Mock;
      };

      client.connect = jest.fn().mockResolvedValue(undefined);
      client.disconnect = jest.fn();

      return client;
    }),
  };
});

type MockRedisClient = EventEmitter & {
  connect: jest.Mock;
  disconnect: jest.Mock;
};

describe('RedisService', () => {
  let service: RedisService;
  let client: MockRedisClient;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379/0'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,

        // provide the mock ConfigService instead of the actual one
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    client = service.client as unknown as MockRedisClient;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should read REDIS_URL and create a lazy, fail-fast client', () => {
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('REDIS_URL');
    expect(Redis).toHaveBeenCalledWith(
      'redis://localhost:6379/0',
      expect.objectContaining({
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      }),
    );
  });

  it('should throw when REDIS_URL is missing', () => {
    mockConfigService.getOrThrow.mockImplementationOnce(() => {
      throw new Error('REDIS_URL is required');
    });

    expect(() => new RedisService(mockConfigService as unknown as ConfigService)).toThrow(
      'REDIS_URL is required',
    );
  });

  describe('lifecycle', () => {
    it('should connect on module init', () => {
      service.onModuleInit();

      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should log a warning instead of throwing when the startup connection fails', async () => {
      client.connect.mockRejectedValueOnce(new AggregateError([new Error('down')], ''));

      service.onModuleInit();
      await new Promise<void>((resolve) => setImmediate(() => resolve()));

      expect(warnSpy).toHaveBeenCalledWith('Redis unavailable at startup: down');
    });

    it('should disconnect on module destroy', () => {
      service.onModuleDestroy();

      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should not warn about connection events after shutdown starts', () => {
      service.onModuleDestroy();

      client.emit('close');

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log a successful connection', () => {
      client.emit('ready');

      expect(logSpy).toHaveBeenCalledWith('Redis connection established.');
    });

    it('should log each lifecycle event with its details', () => {
      client.emit('close');
      client.emit('reconnecting', 500);

      expect(warnSpy).toHaveBeenCalledWith('Redis connection closed.');
      expect(warnSpy).toHaveBeenCalledWith('Redis reconnecting in 500ms.');
    });

    it('should describe AggregateError content instead of logging an empty message', () => {
      client.emit(
        'error',
        new AggregateError(
          [
            new Error('connect ECONNREFUSED ::1:6379'),
            new Error('connect ECONNREFUSED 127.0.0.1:6379'),
          ],
          '',
        ),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis error: connect ECONNREFUSED ::1:6379; connect ECONNREFUSED 127.0.0.1:6379',
      );
    });

    it('should throttle repeated warnings of the same event kind', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);

      client.emit('error', new Error('boom'));
      client.emit('error', new Error('boom'));

      expect(warnSpy).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + RedisService.ERROR_LOG_INTERVAL_MS);

      client.emit('error', new Error('boom'));

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('should throttle each event kind independently', () => {
      client.emit('close');
      client.emit('error', new Error('boom'));

      expect(warnSpy).toHaveBeenCalledWith('Redis connection closed.');
      expect(warnSpy).toHaveBeenCalledWith('Redis error: boom');
    });
  });
});
