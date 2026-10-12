// Set up Rate Limiting arguments for e2e tests to avoid hitting the limit during tests
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '10000';
