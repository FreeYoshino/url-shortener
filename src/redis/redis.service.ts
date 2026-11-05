import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { describeRedisError } from './redis-error';
import { ThrottledLogger } from '../common/throttled-logger';

/**
 * Service responsible for managing Redis cache operations.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /**
   * The logger instance for logging messages related to Redis operations.
   */
  private readonly logger = new Logger(RedisService.name);

  /**
   * The throttle logger instance for logging Redis events with throttling.
   */
  private readonly throttledLogger = new ThrottledLogger(this.logger);

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
   * Logs a warning for one event kind at most once per {@link ThrottledLogger.DEFAULT_INTERVAL_MS}.
   *
   * @param kind - The event kind whose throttle window is used.
   * @param message - The warning message to log.
   * @returns void
   */
  private warn(kind: string, message: string): void {
    if (this.shuttingDown) return;

    this.throttledLogger.warn(kind, message);
  }
}
