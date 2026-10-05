import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { waitFor } from './utils/wait-for';

describe('RedirectController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Replicate the production bootstrap (src/main.ts). Test.createTestingModule
    // does NOT apply the global pipe or the `api` prefix on its own, so without
    // this the validation rules would silently not run.
    setupApp(app);

    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    // Start every test from an empty table.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UrlClick", "Url" CASCADE');
  });

  afterAll(async () => {
    // app.close() triggers PrismaService.onModuleDestroy, which disconnects
    await app.close();
  });

  describe('GET /:shortCode', () => {
    it('should redirect to the original URL with HttpStatus.FOUND (302) when the short code exists', async () => {
      const originalUrl = 'https://github.com/FreeYoshino/url-shortener';
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: originalUrl })
        .expect(HttpStatus.CREATED);

      const shortCode = createResponse.body.shortCode;

      // test the redirect endpoint
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(HttpStatus.FOUND)
        .expect('Location', originalUrl);
    });

    it('should return HttpStatus.NOT_FOUND (404) when the short code does not exist', async () => {
      await request(app.getHttpServer()).get('/nonexistent').expect(HttpStatus.NOT_FOUND);
    });

    it('should NOT resolve the redirect under the /api prefix', async () => {
      const originalUrl = 'https://github.com/FreeYoshino/url-shortener';
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: originalUrl })
        .expect(HttpStatus.CREATED);

      const shortCode = createResponse.body.shortCode;

      // test the redirect endpoint under the /api prefix
      await request(app.getHttpServer()).get(`/api/${shortCode}`).expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('click tracking', () => {
    it('should track clicks when the short code exists', async () => {
      const originalUrl = 'https://github.com/FreeYoshino/url-shortener';
      const shortCode = 'testcode';
      const record = await prisma.url.create({
        data: {
          originalUrl,
          shortCode,
        },
      });

      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(HttpStatus.FOUND)
        .expect('Location', originalUrl);

      // Wait for the click to be tracked in the database(>= 1 click)
      await waitFor(async () => {
        const clicks = await prisma.urlClick.count({
          where: { urlId: record.id },
        });

        return clicks >= 1 ? clicks : null;
      });

      // wait for little time to ensure no multiple clicks are tracked for a single redirect
      await new Promise((resolve) => setTimeout(resolve, 100));
      const finalClicks = await prisma.urlClick.count({
        where: { urlId: record.id },
      });

      expect(finalClicks).toBe(1);
    });

    it('should track multiple clicks for the same short code', async () => {
      const originalUrl = 'https://github.com/FreeYoshino/url-shortener';
      const shortCode = 'testcode';
      const record = await prisma.url.create({
        data: {
          originalUrl,
          shortCode,
        },
      });

      await Promise.all([
        request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.FOUND),
        request(app.getHttpServer()).get(`/${shortCode}`).expect(HttpStatus.FOUND),
      ]);

      // Wait for the click to be tracked in the database(>= 2 click)
      await waitFor(async () => {
        const clicks = await prisma.urlClick.count({
          where: { urlId: record.id },
        });

        return clicks >= 2 ? clicks : null;
      });

      // wait for little time to ensure no multiple clicks are tracked for a single redirect
      await new Promise((resolve) => setTimeout(resolve, 100));
      const finalClicks = await prisma.urlClick.count({
        where: { urlId: record.id },
      });

      expect(finalClicks).toBe(2);
    });

    it('should NOT track clicks when the short code does not exist', async () => {
      await request(app.getHttpServer()).get('/nonexistent').expect(HttpStatus.NOT_FOUND);

      // Wait for a little time to ensure no clicks are tracked
      await new Promise((resolve) => setTimeout(resolve, 100));
      const finalClicks = await prisma.urlClick.count();
      expect(finalClicks).toBe(0);
    });
  });
});
