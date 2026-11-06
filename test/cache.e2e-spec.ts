import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { setupApp } from '../src/setup-app';
import { waitFor } from './utils/wait-for';

describe('Cache (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UrlClick", "Url" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('should warm up the cache when a URL is created', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);

    const { originalUrl, shortCode, createdAt, updatedAt } = res.body;

    const cacheKey = `url:${shortCode}`;

    const client = redis.client;
    const cachedData = await client.get(cacheKey);

    expect(cachedData).toBeDefined();

    const parsedData = JSON.parse(cachedData as string);
    expect(parsedData).toMatchObject({
      originalUrl,
      shortCode,
      createdAt,
      updatedAt,
    });
  });

  it('should hit cache on redirect and ignore direct DB changes', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);

    const { originalUrl, shortCode } = createRes.body;

    await request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.FOUND);

    const urlRecord = await prisma.url.findUnique({
      where: { shortCode },
    });
    await prisma.url.update({
      where: {
        id: urlRecord?.id,
      },
      data: {
        originalUrl: 'https://changed.com',
      },
    });

    const secondRedirectRes = await request(app.getHttpServer())
      .get(`/${shortCode}`)
      .expect(HttpStatus.FOUND);

    expect(secondRedirectRes.headers.location).toBe(originalUrl);
  });

  it('should hit cache on API endpoint and ignore direct DB changes', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);
    const { originalUrl, shortCode } = createRes.body;

    await request(app.getHttpServer()).get(`/api/urls/${shortCode}`).expect(HttpStatus.OK);

    const urlRecord = await prisma.url.findUnique({
      where: { shortCode },
    });
    await prisma.url.update({
      where: {
        id: urlRecord?.id,
      },
      data: {
        originalUrl: 'https://changed.com',
      },
    });

    const secondRedirectRes = await request(app.getHttpServer())
      .get(`/api/urls/${shortCode}`)
      .expect(HttpStatus.OK);

    expect(secondRedirectRes.body.originalUrl).toBe(originalUrl);
  });

  it('should record clicks even when the URL is served from cache', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);

    const { shortCode } = res.body;

    await request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.FOUND);
    await request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.FOUND);

    const urlRecord = await prisma.url.findUnique({
      where: { shortCode },
    });

    // wait a second to ensure the click records are processed
    await waitFor(() =>
      prisma.urlClick
        .count({ where: { urlId: urlRecord?.id } })
        .then((count) => (count >= 2 ? count : null)),
    );

    const clickCount = await prisma.urlClick.count({
      where: { urlId: urlRecord?.id },
    });

    expect(clickCount).toBe(2);
  });

  it('should invalidate cache on PUT request', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);

    const { shortCode } = createRes.body;

    const client = redis.client;
    const cacheKey = `url:${shortCode}`;

    expect(await client.exists(cacheKey)).toBe(1); // Cache should exist after creation

    await request(app.getHttpServer())
      .put(`/api/urls/${shortCode}`)
      .send({ url: 'https://updated.com' })
      .expect(HttpStatus.OK);

    expect(await client.exists(cacheKey)).toBe(0); // Cache should be invalidated after update

    const res = await request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.FOUND);

    expect(res.headers.location).toBe('https://updated.com'); // Should redirect to updated URL
  });

  it('should invalidate cache on DELETE request', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);

    const { shortCode } = createRes.body;

    const client = redis.client;
    const cacheKey = `url:${shortCode}`;

    expect(await client.exists(cacheKey)).toBe(1); // Cache should exist after creation

    await request(app.getHttpServer())
      .delete(`/api/urls/${shortCode}`)
      .expect(HttpStatus.NO_CONTENT);

    expect(await client.exists(cacheKey)).toBe(0); // Cache should be invalidated after update

    // The URL should no longer be found after deletion
    await request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.NOT_FOUND);
  });

  it('should not implement cache for non-existent short codes', async () => {
    const nonExistentShortCode = 'nonexistent123';

    const client = redis.client;
    const cacheKey = `url:${nonExistentShortCode}`;

    await request(app.getHttpServer())
      .get(`/api/urls/${nonExistentShortCode}`)
      .expect(HttpStatus.NOT_FOUND);

    expect(await client.exists(cacheKey)).toBe(0); // Cache should not exist for non-existent short code

    // use prisma to create a record with the same short code after the cache check avoid POST warming up the cache for this short code
    await prisma.url.create({
      data: {
        shortCode: nonExistentShortCode,
        originalUrl: 'https://late-added.com',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/urls/${nonExistentShortCode}`)
      .expect(HttpStatus.OK);

    expect(res.body.originalUrl).toBe('https://late-added.com'); //
  });
});
