import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { nanoid } from 'nanoid';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Wrapped rather than replaced: every test keeps real nanoid output, and only
// the collision test overrides a single call to force a duplicate short code.
// Colliding on nanoid's 64^8 keyspace naturally is not feasible, but the
// constraint violation it produces is the same one.
jest.mock('nanoid', () => {
  const actual = jest.requireActual<typeof import('nanoid')>('nanoid');
  return { ...actual, nanoid: jest.fn(actual.nanoid) };
});
const mockNanoid = nanoid as jest.Mock;

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

    mockNanoid.mockClear();
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
      expect(record?.shortCode).toBe(res.body.shortCode);
    });

    it('should return the same short code when the same URL is submitted twice', async () => {
      const dto = { url: 'https://example.com' };

      const first = await request(app.getHttpServer()).post('/api/shorten').send(dto).expect(201);
      const second = await request(app.getHttpServer()).post('/api/shorten').send(dto).expect(201);

      expect(second.body.shortCode).toBe(first.body.shortCode);

      // the second request must reuse the existing row, not insert another one
      await expect(prisma.url.count()).resolves.toBe(1);
    });

    // Regression guard: the service used to pick which unique constraint was
    // violated by reading `error.meta.target`. With the Prisma 7 driver adapter
    // that field is `undefined`, so every short-code collision fell through and
    // surfaced as a 500 instead of retrying. Real Postgres raises the real
    // error here, which mocked tests cannot reproduce.
    it('should retry with a new short code when the generated code collides', async () => {
      const takenCode = 'COLLIDES';
      await prisma.url.create({
        data: { originalUrl: 'https://taken.example.com', shortCode: takenCode },
      });

      // hand out the already-taken code once, then fall back to unique ones
      mockNanoid.mockReturnValueOnce(takenCode);

      const res = await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ url: 'https://fresh.example.com' })
        .expect(201);

      expect(res.body.shortCode).not.toBe(takenCode);
      expect(res.body.originalUrl).toBe('https://fresh.example.com');

      // the seeded row plus the newly created one
      await expect(prisma.url.count()).resolves.toBe(2);
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
