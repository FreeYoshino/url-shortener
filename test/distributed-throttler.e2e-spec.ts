import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from './utils/create-app';
import { closeApp } from './utils/close-app';

describe('Distributed Throttler (e2e)', () => {
  let appA: INestApplication<App>;
  let appB: INestApplication<App>;

  beforeAll(async () => {
    process.env.THROTTLE_WRITE_LIMIT = '2';
    process.env.THROTTLE_REDIRECT_LIMIT = '2';

    appA = await createApp();
    appB = await createApp();
  });

  afterAll(async () => {
    await closeApp(appA);
    await closeApp(appB);
  });

  it('should share throttle state between two instances', async () => {
    const payload = { url: 'https://example.com' };

    await request(appA.getHttpServer()).post('/api/urls').send(payload).expect(HttpStatus.CREATED);

    await request(appB.getHttpServer()).post('/api/urls').send(payload).expect(HttpStatus.CREATED);

    await request(appA.getHttpServer())
      .post('/api/urls')
      .send(payload)
      .expect(HttpStatus.TOO_MANY_REQUESTS)
      .expect('Retry-After', /\d+/);

    await request(appB.getHttpServer())
      .post('/api/urls')
      .send(payload)
      .expect(HttpStatus.TOO_MANY_REQUESTS)
      .expect('Retry-After', /\d+/);
  });

  it('should store throttle state in Redis when application is restarted', async () => {
    const payload = { url: 'https://example.com' };

    // use specific app instance to avoid race conditions with the other test
    let firstApp: INestApplication<App> | undefined;
    try {
      firstApp = await createApp();

      await request(firstApp.getHttpServer())
        .post('/api/urls')
        .send(payload)
        .expect(HttpStatus.CREATED);
      await request(firstApp.getHttpServer())
        .post('/api/urls')
        .send(payload)
        .expect(HttpStatus.CREATED);
      await request(firstApp.getHttpServer())
        .post('/api/urls')
        .send(payload)
        .expect(HttpStatus.TOO_MANY_REQUESTS)
        .expect('Retry-After', /\d+/);
    } finally {
      if (firstApp) await closeApp(firstApp);
    }

    // restart the app to simulate a crash or redeployment
    let secondApp: INestApplication<App> | undefined;

    try {
      secondApp = await createApp();

      // the throttle state should be preserved in Redis, so the next request should still be throttled
      await request(secondApp.getHttpServer())
        .post('/api/urls')
        .send(payload)
        .expect(HttpStatus.TOO_MANY_REQUESTS)
        .expect('Retry-After', /\d+/);
    } finally {
      if (secondApp) await closeApp(secondApp);
    }
  });

  it('should handle concurrent requests across instances', async () => {
    const payload = { url: 'https://example.com' };

    const requests = Array.from({ length: 7 }, (_, index) => {
      const app = index % 2 === 0 ? appA : appB;
      return request(app.getHttpServer()).post('/api/urls').send(payload);
    });

    const responses = await Promise.all(requests);

    const statuses = responses.map((res) => res.status);

    const createdCount = statuses.filter((status) => status === HttpStatus.CREATED).length;
    const tooManyRequestsCount = statuses.filter(
      (status) => status === HttpStatus.TOO_MANY_REQUESTS,
    ).length;

    expect(createdCount).toBe(2);
    expect(tooManyRequestsCount).toBe(5);

    responses
      .filter((res) => res.status === HttpStatus.TOO_MANY_REQUESTS)
      .forEach((res) => {
        expect(res.headers['retry-after']).toMatch(/\d+/);
      });
  });

  it('should reset throttle state after TTL expires', async () => {
    const previousTtl = process.env.THROTTLE_TTL_MS;
    process.env.THROTTLE_TTL_MS = '3000'; // 1 second TTL

    let app: INestApplication<App> | undefined;
    try {
      app = await createApp();

      const payload = { url: 'https://example.com' };

      await request(app.getHttpServer()).post('/api/urls').send(payload).expect(HttpStatus.CREATED);
      await request(app.getHttpServer()).post('/api/urls').send(payload).expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .post('/api/urls')
        .send(payload)
        .expect(HttpStatus.TOO_MANY_REQUESTS)
        .expect('Retry-After', /\d+/);

      // wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 3300));

      // after TTL expires, the throttle state should reset and allow new requests
      await request(app.getHttpServer()).post('/api/urls').send(payload).expect(HttpStatus.CREATED);
      await request(app.getHttpServer()).post('/api/urls').send(payload).expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .post('/api/urls')
        .send(payload)
        .expect(HttpStatus.TOO_MANY_REQUESTS)
        .expect('Retry-After', /\d+/);
    } finally {
      if (app) await closeApp(app);
      if (previousTtl === undefined) delete process.env.THROTTLE_TTL_MS;
      else process.env.THROTTLE_TTL_MS = previousTtl;
    }
  });
});
