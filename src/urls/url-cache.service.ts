import { Injectable, Logger } from '@nestjs/common';
import { Url } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { describeRedisError } from '../redis/redis-error';

export type UrlCacheEntry = Pick<
  Url,
  'id' | 'originalUrl' | 'shortCode' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class UrlCacheService {
  /**
   * The interval in milliseconds between logging error messages.
   */
  static readonly ERROR_LOG_INTERVAL_MS = 10000;

  /** Redis key namespace, keeping URL cache separate from throttler counters. */
  private static readonly KEY_PREFIX = 'url:';

  private readonly redisService: RedisService;

  /**
   * The logger instance for logging messages related to URL cache operations.
   */
  private readonly logger = new Logger(UrlCacheService.name);

  /** Throttle per operation so one failing command cannot hide another. */
  private readonly lastLoggedAt = new Map<string, number>();

  /**
   * The time-to-live (TTL) for cached URLs in milliseconds.
   *
   * `ConfigService` returns environment values as strings, so the value is
   * converted and validated before being handed to Redis as `PX`.
   */
  private readonly cacheTtlMs: number;

  constructor(redisService: RedisService, configService: ConfigService) {
    this.redisService = redisService;

    const configuredTtl = Number(configService.get<string>('URL_CACHE_TTL_MS', '60000'));
    this.cacheTtlMs = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 60_000;
  }

  /**
   * Retrieves a cached URL entry from Redis by its short code.
   *
   * @param shortCode - The short code of the URL to retrieve from the cache.
   * @returns Promise<UrlCacheEntry | null> - The cached URL entry if found, or null if not found or on error.
   */
  async get(shortCode: string): Promise<UrlCacheEntry | null> {
    let rawData: string | null;

    try {
      rawData = await this.redisService.client.get(UrlCacheService.key(shortCode));
    } catch (error) {
      this.warn('get', `Redis get error for shortCode ${shortCode}: ${describeRedisError(error)}`);
      return null;
    }

    // Cache miss returns null
    if (rawData === null) return null;

    try {
      const parsedData = JSON.parse(rawData);

      if (
        !parsedData ||
        typeof parsedData !== 'object' ||
        typeof parsedData.id !== 'string' ||
        typeof parsedData.originalUrl !== 'string' ||
        typeof parsedData.shortCode !== 'string' ||
        !parsedData.createdAt ||
        !parsedData.updatedAt
      ) {
        this.warn('get', `Corrupted cache schema for key "${shortCode}": invalid fields`);
        return null;
      }

      const createdAt = new Date(parsedData.createdAt);
      const updatedAt = new Date(parsedData.updatedAt);

      // check if the date parsing was successful
      if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) {
        this.warn('get', `Corrupted cache schema for key "${shortCode}": invalid date fields`);
        return null;
      }

      return {
        id: parsedData.id,
        originalUrl: parsedData.originalUrl,
        shortCode: parsedData.shortCode,
        createdAt,
        updatedAt,
      };
    } catch (error) {
      // If JSON parsing fails, log the error and return null
      this.warn('get', `Failed to parse cached data for key "${shortCode}": ${error}`);
      return null;
    }
  }

  /**
   * Sets a cached URL entry in Redis with a specified short code.
   *
   * @param shortCode - The short code of the URL to cache.
   * @param entry - The URL cache entry to store in Redis.
   */
  async set(entry: UrlCacheEntry): Promise<void> {
    try {
      const serializedData = JSON.stringify(entry);
      await this.redisService.client.set(
        UrlCacheService.key(entry.shortCode),
        serializedData,
        'PX',
        this.cacheTtlMs,
      );
    } catch (error) {
      this.warn(
        'set',
        `Redis set error for shortCode ${entry.shortCode}: ${describeRedisError(error)}`,
      );
    }
  }

  /**
   * Invalidates a cached URL entry in Redis with a specified short code.
   *
   * @param shortCode - The short code of the URL to invalidate.
   */
  async invalidate(shortCode: string): Promise<void> {
    try {
      await this.redisService.client.del(UrlCacheService.key(shortCode));
    } catch (error) {
      this.warn(
        'invalidate',
        `Redis invalidate error for shortCode ${shortCode}: ${describeRedisError(error)}`,
      );
    }
  }

  /** Builds the namespaced Redis key for a short code. */
  private static key(shortCode: string): string {
    return `${UrlCacheService.KEY_PREFIX}${shortCode}`;
  }

  /**
   * Logs a warning for one event kind at most once per
   * {@link UrlCacheService.ERROR_LOG_INTERVAL_MS}.
   *
   * @param kind - The event kind whose throttle window is used.
   * @param message - The warning message to log.
   * @returns void
   */
  private warn(kind: string, message: string): void {
    const now = Date.now();
    if (now - (this.lastLoggedAt.get(kind) ?? 0) < UrlCacheService.ERROR_LOG_INTERVAL_MS) return;

    this.lastLoggedAt.set(kind, now);
    this.logger.warn(message);
  }
}
