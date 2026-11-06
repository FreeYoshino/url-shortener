import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/redis/redis.service';
import { setupApp } from '../../src/setup-app';
import { waitFor } from './wait-for';

/**
 * Builds an e2e application with the production bootstrap applied and waitsuntil its Redis client is ready.
 *
 * RedisService starts connecting without blocking startup (fail-open).
 * Without this wait, the first request of a test can race the connection and silently bypass the rate limiter or the cache.
 */
export async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  setupApp(app);
  await app.init();

  const redis = app.get(RedisService);
  await waitFor(async () => (redis.client.status === 'ready' ? true : null), {
    description: 'Redis client to be ready',
  });

  return app;
}
