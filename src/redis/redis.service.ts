import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { describeRedisError } from './redis-error';

/**
 * Service responsible for managing Redis cache operations.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /**
   * The interval in milliseconds between logging error messages.
   */
  static readonly ERROR_LOG_INTERVAL_MS = 10000;

  /**
   * The logger instance for logging messages related to Redis operations.
   */
  private readonly logger = new Logger(RedisService.name);

  /** Throttle per event kind so a `close` cannot swallow the `error` after it. */
  private readonly lastLoggedAt = new Map<string, number>();

  /** Suppress disconnect warnings during an intentional shutdown. */
  private shuttingDown = false;

  readonly client: Redis;

  constructor(configService: ConfigService) {
    const url = configService.getOrThrow<string>('REDIS_URL');

    // Initialize Redis client with configuration options
    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.client.on('ready', () => this.logger.log('Redis connection established.'));
    this.client.on('close', () => this.warn('close', 'Redis connection closed.'));
    this.client.on('reconnecting', (delay: number) =>
      this.warn('reconnecting', `Redis reconnecting in ${delay}ms.`),
    );
    this.client.on('error', (error: unknown) =>
      this.warn('error', `Redis error: ${describeRedisError(error)}`),
    );
  }

  onModuleInit(): void {
    // no await here to avoid blocking the application startup
    void this.client.connect().catch((error: unknown) => {
      this.warn('startup', `Redis unavailable at startup: ${describeRedisError(error)}`);
    });
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.client.disconnect();
  }

  /**
   * Logs a warning for one event kind at most once per
   * {@link RedisService.ERROR_LOG_INTERVAL_MS}.
   *
   * @param kind - The event kind whose throttle window is used.
   * @param message - The warning message to log.
   * @returns void
   */
  private warn(kind: string, message: string): void {
    if (this.shuttingDown) return;

    const now = Date.now();
    if (now - (this.lastLoggedAt.get(kind) ?? 0) < RedisService.ERROR_LOG_INTERVAL_MS) return;

    this.lastLoggedAt.set(kind, now);
    this.logger.warn(message);
  }
}
