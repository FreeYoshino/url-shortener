import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

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
        .post('/api/shorten')
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
        .post('/api/shorten')
        .send({ url: originalUrl })
        .expect(HttpStatus.CREATED);

      const shortCode = createResponse.body.shortCode;

      // test the redirect endpoint under the /api prefix
      await request(app.getHttpServer()).get(`/api/${shortCode}`).expect(HttpStatus.NOT_FOUND);
    });
  });
});
