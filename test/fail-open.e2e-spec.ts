import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from './utils/create-app';
import { closeApp } from './utils/close-app';
import { disconnectRedis } from './utils/disconnect-redis';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { waitFor } from './utils/wait-for';

describe('Fail Open (e2e)', () => {
  let app: INestApplication<App>;

  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    app = await createApp();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UrlClick", "Url" CASCADE');
  });

  afterEach(async () => {
    if (redis.client.status === 'end') {
      await redis.client.connect();
    }
  });
  afterAll(async () => {
    await closeApp(app);
  });

  describe('cached Redis is unavailable', () => {
    it('should fall back to db on GET/:shortCode ', async () => {
      const record = await prisma.url.create({
        data: {
          originalUrl: 'https://example.com',
          shortCode: 'example',
        },
      });

      // warn up the cache
      await request(app.getHttpServer()).get(`/${record.shortCode}`).expect(HttpStatus.FOUND);

      // disconnect redis
      await disconnectRedis(redis.client);
      expect(redis.client.status).toBe('end');

      const updatedRecord = await prisma.url.update({
        where: { id: record.id },
        data: { originalUrl: 'https://updated-example.com' },
      });

      const response = await request(app.getHttpServer())
        .get(`/${record.shortCode}`)
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(updatedRecord.originalUrl);

      await waitFor(async () => {
        const clicks = await prisma.urlClick.count({
          where: { urlId: record.id },
        });
        return clicks >= 2 ? clicks : null;
      });

      const finalClicks = await prisma.urlClick.count({
        where: { urlId: record.id },
      });
      expect(finalClicks).toBe(2);
    });

    it('should fall back to db on GET/api/urls/:shortCode', async () => {
      const record = await prisma.url.create({
        data: {
          originalUrl: 'https://example.com',
          shortCode: 'example',
        },
      });

      // warn up the cache
      await request(app.getHttpServer()).get(`/api/urls/${record.shortCode}`).expect(HttpStatus.OK);

      // disconnect redis
      await disconnectRedis(redis.client);
      expect(redis.client.status).toBe('end');

      const updatedRecord = await prisma.url.update({
        where: { id: record.id },
        data: { originalUrl: 'https://updated-example.com' },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/urls/${record.shortCode}`)
        .expect(HttpStatus.OK);
      expect(response.body.originalUrl).toBe(updatedRecord.originalUrl);
    });

    it('should create URL even when Redis is unavailable', async () => {
      await disconnectRedis(redis.client);
      expect(redis.client.status).toBe('end');

      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: 'https://example.com' })
        .expect(HttpStatus.CREATED);

      const record = await prisma.url.findUnique({
        where: { shortCode: response.body.shortCode },
      });
      expect(record).not.toBeNull();
      expect(record?.originalUrl).toBe('https://example.com');
    });

    it('should update URL even when Redis invalidation fails', async () => {
      const record = await prisma.url.create({
        data: {
          originalUrl: 'https://example.com',
          shortCode: 'example',
        },
      });

      await disconnectRedis(redis.client);
      expect(redis.client.status).toBe('end');

      await request(app.getHttpServer())
        .put(`/api/urls/${record.shortCode}`)
        .send({ url: 'https://updated-example.com' })
        .expect(HttpStatus.OK);

      const updatedRecord = await prisma.url.findUnique({
        where: { id: record.id },
      });

      expect(updatedRecord).not.toBeNull();
      expect(updatedRecord?.originalUrl).toBe('https://updated-example.com');
    });

    it('should delete URL even when Redis invalidation fails', async () => {
      const record = await prisma.url.create({
        data: {
          originalUrl: 'https://example.com',
          shortCode: 'delete-example',
        },
      });

      await disconnectRedis(redis.client);
      expect(redis.client.status).toBe('end');

      await request(app.getHttpServer())
        .delete(`/api/urls/${record.shortCode}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify DB record has been deleted
      const deletedRecord = await prisma.url.findUnique({
        where: { id: record.id },
      });

      expect(deletedRecord).toBeNull();
    });
  });

  describe('throttled Redis is unavailable', () => {
    it('should allow all requests to go through when Redis is unavailable', async () => {
      const previousLimit = process.env.THROTTLE_LIMIT;
      process.env.THROTTLE_LIMIT = '2';

      let throttledApp: INestApplication<App> | undefined;
      try {
        // Each app owns its Redis client: disconnect the client of the app
        // under test, not the one created in beforeAll.
        throttledApp = await createApp();
        const throttledRedis = throttledApp.get(RedisService);
        await disconnectRedis(throttledRedis.client);
        expect(throttledRedis.client.status).toBe('end');
        for (let i = 0; i < 3; i++) {
          const response = await request(throttledApp.getHttpServer())
            .get('/api')
            .expect(HttpStatus.OK)
            .expect('x-ratelimit-remaining', '2');

          expect(response.headers['retry-after']).toBeUndefined();
        }
      } finally {
        if (throttledApp) await closeApp(throttledApp);
        if (previousLimit === undefined) delete process.env.THROTTLE_LIMIT;
        else process.env.THROTTLE_LIMIT = previousLimit;
      }
    });

    it('should allow all requests to go through when Redis is unavailable on @Throttle() endpoints', async () => {
      const previousLimit = process.env.THROTTLE_WRITE_LIMIT;
      process.env.THROTTLE_WRITE_LIMIT = '2';

      let throttledApp: INestApplication<App> | undefined;
      try {
        // Each app owns its Redis client: disconnect the client of the app
        // under test, not the one created in beforeAll.
        throttledApp = await createApp();
        const throttledRedis = throttledApp.get(RedisService);
        await disconnectRedis(throttledRedis.client);
        expect(throttledRedis.client.status).toBe('end');
        for (let i = 0; i < 3; i++) {
          const response = await request(throttledApp.getHttpServer())
            .post('/api/urls')
            .send({ url: 'https://example.com' })
            .expect(HttpStatus.CREATED)
            .expect('x-ratelimit-remaining', '2');

          expect(response.headers['retry-after']).toBeUndefined();
        }
      } finally {
        if (throttledApp) await closeApp(throttledApp);
        if (previousLimit === undefined) delete process.env.THROTTLE_WRITE_LIMIT;
        else process.env.THROTTLE_WRITE_LIMIT = previousLimit;
      }
    });

    it('should work when redis restarts and the app reconnects', async () => {
      const previousLimit = process.env.THROTTLE_LIMIT;
      process.env.THROTTLE_LIMIT = '2';

      let throttledApp: INestApplication<App> | undefined;
      try {
        throttledApp = await createApp();
        const redis = throttledApp.get(RedisService);

        await disconnectRedis(redis.client);
        expect(redis.client.status).toBe('end');

        await redis.client.connect();
        expect(redis.client.status).toBe('ready');

        await request(throttledApp.getHttpServer())
          .get('/api')
          .expect(HttpStatus.OK)
          .expect('x-ratelimit-remaining', '1');

        await request(throttledApp.getHttpServer())
          .get('/api')
          .expect(HttpStatus.OK)
          .expect('x-ratelimit-remaining', '0');

        await request(throttledApp.getHttpServer())
          .get('/api')
          .expect(HttpStatus.TOO_MANY_REQUESTS)
          .expect('retry-after', /\d+/);
      } finally {
        if (throttledApp) await closeApp(throttledApp);
        if (previousLimit === undefined) delete process.env.THROTTLE_LIMIT;
        else process.env.THROTTLE_LIMIT = previousLimit;
      }
    });
  });

  it('should start and serve requests when Redis is unavailable at boot', async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    const previousLimit = process.env.THROTTLE_LIMIT;

    process.env.REDIS_URL = 'redis://127.0.0.1:63999/15'; // free port, no Redis server running
    process.env.THROTTLE_LIMIT = '2';
    process.env.REDIS_CONNECT_TIMEOUT_MS = '50';

    let bootApp: INestApplication<App> | undefined;
    try {
      bootApp = await createApp({ waitForRedisReady: false });

      const bootPrisma = bootApp.get(PrismaService);
      const record = await bootPrisma.url.create({
        data: {
          originalUrl: 'https://example.com',
          shortCode: 'boot',
        },
      });

      // throttler fail-open
      await request(bootApp.getHttpServer()).get('/api').expect(200);
      await request(bootApp.getHttpServer()).get('/api').expect(200);
      await request(bootApp.getHttpServer()).get('/api').expect(200);

      // cache fail-open
      await request(bootApp.getHttpServer())
        .get(`/${record.shortCode}`)
        .expect(HttpStatus.FOUND)
        .expect('Location', record.originalUrl);
    } finally {
      if (bootApp) await closeApp(bootApp);
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousRedisUrl;
      if (previousLimit === undefined) delete process.env.THROTTLE_LIMIT;
      else process.env.THROTTLE_LIMIT = previousLimit;
    }
  });
});
