// Set up Rate Limiting arguments for e2e tests to avoid hitting the limit during tests
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '10000';
process.env.THROTTLE_WRITE_LIMIT = '10000';
process.env.THROTTLE_REDIRECT_LIMIT = '10000';

// e2e alaways uses DB 15
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379/0');
redisUrl.pathname = '/15';
process.env.REDIS_URL = redisUrl.toString();
