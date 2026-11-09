import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottledLogger } from '../common/throttled-logger';
import { describeRedisError } from '../redis/redis-error';
import { RedisService } from '../redis/redis.service';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Atomically counts a hit, opens a block when the limit is crossed, and reports the state the guard expects. Redis TIME is used so instances do not depend on their local clocks.
 *
 * KEYS[1] counter, KEYS[2] block marker
 * ARGV[1] ttl (ms), ARGV[2] limit, ARGV[3] block duration (ms)
 */
const INCREMENT_SCRIPT = `
-- Translate the arguments to local variables for clarity
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

-- Use Redis TIME command to get the current time in milliseconds
local redisTime = redis.call('TIME')
local nowMs = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)

-- Check if the client is currently blocked by checking the block marker
local blockUntil = tonumber(redis.call('GET', KEYS[2]) or '0') or 0

-- Still blocked: do not count the request.
if blockUntil > nowMs then
  local total = tonumber(redis.call('GET', KEYS[1]) or '0') or 0
  local counterTtl = redis.call('PTTL', KEYS[1])
  if counterTtl < 0 then counterTtl = 0 end
  return { total, math.ceil(counterTtl / 1000), 1, math.ceil((blockUntil - nowMs) / 1000) }
end

-- The block just expired. The marker outlives it on purpose so the stale
-- counter can be cleared and this request starts a fresh window.
if blockUntil > 0 then
  redis.call('DEL', KEYS[1], KEYS[2])
end

local total = redis.call('INCR', KEYS[1])
local counterTtl = redis.call('PTTL', KEYS[1])
if counterTtl < 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
  counterTtl = ttl
end

-- The request that crosses the limit is rejected and starts the block.
if total > limit then
  redis.call('SET', KEYS[2], tostring(nowMs + blockDuration), 'PX', blockDuration + ttl)
  return { total, math.ceil(counterTtl / 1000), 1, math.ceil(blockDuration / 1000) }
end

return { total, math.ceil(counterTtl / 1000), 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redisService: RedisService;

  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly throttledLogger = new ThrottledLogger(this.logger);

  private static readonly COUNTER_KEY_PREFIX = 'throttle:';
  private static readonly BLOCK_KEY_PREFIX = 'throttle:block:';

  constructor(redisService: RedisService) {
    this.redisService = redisService;
  }

  /**
   * Atomically increments the request counter for a client and handles rate-limiting and blocking logic.
   *
   * @param key - Unique identifier for the client
   * @param ttl - The time-to-live window in **milliseconds (ms)** during which requests are accumulated
   * @param limit - Maximum allowed requests within the given `ttl` window
   * @param blockDuration - Duration in **milliseconds (ms)** for which the client is blocked once the `limit` is exceeded
   * @param throttlerName - Name of the throttler configuration (e.g., "default" or "auth") to distinguish active rate-limiting rules
   * @returns A promise resolving to a `ThrottlerStorageRecord` object containing the current throttle state:
   *          - `totalHits`: Total number of requests recorded in the current window
   *          - `timeToExpire`: Remaining time in seconds before the counter window resets
   *          - `isBlocked`: Boolean flag indicating whether the client is currently blocked
   *          - `timeToBlockExpire`: Remaining time in seconds before the block is lifted
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const effectiveBlockDuration = blockDuration > 0 ? blockDuration : ttl;

    try {
      const reply = (await this.redisService.client.eval(
        INCREMENT_SCRIPT,
        2, // Number of keys being passed to the script
        RedisThrottlerStorage.COUNTER_KEY_PREFIX + key, // KEYS[1]
        RedisThrottlerStorage.BLOCK_KEY_PREFIX + key, // KEYS[2]
        ttl, // ARGV[1]
        limit, // ARGV[2]
        effectiveBlockDuration, // ARGV[3]
      )) as [number, number, number, number];

      return {
        totalHits: Number(reply[0]),
        timeToExpire: Number(reply[1]),
        isBlocked: Number(reply[2]) === 1,
        timeToBlockExpire: Number(reply[3]),
      };
    } catch (error) {
      this.throttledLogger.warn(
        throttlerName,
        `[${throttlerName}] Redis throttler storage error: ${describeRedisError(error)}`,
      );

      // when Redis is unavailable, return a default record that allows requests to proceed without blocking
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
