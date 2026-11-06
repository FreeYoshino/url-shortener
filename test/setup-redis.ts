import Redis from 'ioredis';
import { disconnectRedis } from './utils/disconnect-redis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL must be set by setup-e2e.ts before the e2e Redis setup runs.');
}

// Separate client from the app's: it must not be affected when a test deliberately disconnects the app's Redis client for fail-open checks.
const client = new Redis(redisUrl, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});

beforeAll(async () => {
  await client.connect();
  await client.ping();
});

beforeEach(async () => {
  await client.flushdb();
});

afterAll(async () => {
  await disconnectRedis(client);
});
