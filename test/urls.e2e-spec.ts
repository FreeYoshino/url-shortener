import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('UrlsController (e2e)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.setGlobalPrefix('api');

    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    // Start every test from an empty table. `UrlClick.urlId -> Url.id` is
    // ON DELETE RESTRICT, so both tables must be named (or CASCADE used).
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UrlClick", "Url" CASCADE');
  });

  afterAll(async () => {
    // app.close() triggers PrismaService.onModuleDestroy, which disconnects
    await app.close();
  });

  describe('POST /api/shorten', () => {
    it('should create a shortened URL and return the full DTO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'https://example.com' })
        .expect(201);

      // exact response shape: the four DTO fields and nothing else
      expect(Object.keys(res.body).sort()).toEqual(
        ['createdAt', 'originalUrl', 'shortCode', 'updatedAt'].sort(),
      );
      expect(res.body.originalUrl).toBe('https://example.com');
      expect(res.body.shortCode).toHaveLength(8);

      // dates are serialized as ISO strings
      expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
      expect(new Date(res.body.updatedAt).toISOString()).toBe(res.body.updatedAt);
    });

    it('should persist the record in the database', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'https://example.com' })
        .expect(201);

      const record = await prisma.url.findUnique({
        where: { originalUrl: 'https://example.com' },
      });

      expect(record).not.toBeNull();
      expect(record?.shortUrl).toBe(res.body.shortCode);
    });

    it('should return the same short code when the same URL is submitted twice', async () => {
      const dto = { url: 'https://example.com' };

      const first = await request(app.getHttpServer()).post('/api/shorten').send(dto).expect(201);
      const second = await request(app.getHttpServer()).post('/api/shorten').send(dto).expect(201);

      expect(second.body.shortCode).toBe(first.body.shortCode);

      // the second request must reuse the existing row, not insert another one
      await expect(prisma.url.count()).resolves.toBe(1);
    });

    it('should not match the route without the global /api prefix', async () => {
      await request(app.getHttpServer())
        .post('/shorten')
        .send({ url: 'https://example.com' })
        .expect(404);
    });
  });

  describe('request validation', () => {
    it('should reject a missing url with 400', async () => {
      await request(app.getHttpServer()).post('/api/shorten').send({}).expect(400);
    });

    it('should reject a malformed url with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'not-a-url' })
        .expect(400);
    });

    it('should reject a url without a protocol with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'example.com' })
        .expect(400);
    });

    it('should reject unknown properties (forbidNonWhitelisted) with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'https://example.com', foo: 'bar' })
        .expect(400);
    });

    it('should not create a record when validation fails', async () => {
      await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'not-a-url' })
        .expect(400);

      await expect(prisma.url.count()).resolves.toBe(0);
    });
  });
});
