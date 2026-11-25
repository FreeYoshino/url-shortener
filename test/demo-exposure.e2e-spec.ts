import { HttpStatus, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { UrlCacheService } from '../src/urls/url-cache.service';
import { UrlsModule } from '../src/urls/urls.module';
import { waitFor } from './utils/wait-for';

const ALLOWED_HOST = 'allowed.com';

describe('Demo exposure — allowlist enforced (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        UrlsModule.register({ adminApi: true, allowedHosts: [ALLOWED_HOST] }),
      ],
    })
      // The backstop reads from the DB on a cache miss; keep Redis out of this suite.
      .overrideProvider(UrlCacheService)
      .useValue({
        get: async () => null,
        set: async () => {},
        invalidate: async () => {},
      })
      .compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UrlClick", "Url" CASCADE');
  });

  describe('POST /api/urls', () => {
    it('should reject creating a URL outside the allowlist with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: 'https://notallowed.com/phish' })
        .expect(HttpStatus.BAD_REQUEST);

      await expect(prisma.url.count()).resolves.toBe(0);
    });

    it('should reject a subdomain of an allowed host because matching is exact', async () => {
      await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: `https://sub.${ALLOWED_HOST}/path` })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject non-http(s) protocols even on an allowed host', async () => {
      await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: `ftp://${ALLOWED_HOST}/file` })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should create a URL inside the allowlist', async () => {
      await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: `https://${ALLOWED_HOST}/path` })
        .expect(HttpStatus.CREATED);
    });
  });

  describe('PUT /api/urls/:shortCode', () => {
    it('should reject updating an existing record to a host outside the allowlist', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: `https://${ALLOWED_HOST}/a`, shortCode: 'allowed1' },
      });

      await request(app.getHttpServer())
        .put(`/api/urls/${record.shortCode}`)
        .send({ url: 'https://notallowed.com/phish' })
        .expect(HttpStatus.BAD_REQUEST);

      const unchanged = await prisma.url.findUnique({ where: { shortCode: record.shortCode } });
      expect(unchanged?.originalUrl).toBe(`https://${ALLOWED_HOST}/a`);
    });

    it('should reject updating to a subdomain of an allowed host because matching is exact', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: `https://${ALLOWED_HOST}/a`, shortCode: 'allowed2' },
      });

      await request(app.getHttpServer())
        .put(`/api/urls/${record.shortCode}`)
        .send({ url: `https://sub.${ALLOWED_HOST}/path` })
        .expect(HttpStatus.BAD_REQUEST);

      const unchanged = await prisma.url.findUnique({ where: { shortCode: record.shortCode } });
      expect(unchanged?.originalUrl).toBe(`https://${ALLOWED_HOST}/a`);
    });

    it('should reject updating to a non-http(s) protocol even on an allowed host', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: `https://${ALLOWED_HOST}/a`, shortCode: 'allowed3' },
      });

      await request(app.getHttpServer())
        .put(`/api/urls/${record.shortCode}`)
        .send({ url: `ftp://${ALLOWED_HOST}/file` })
        .expect(HttpStatus.BAD_REQUEST);

      const unchanged = await prisma.url.findUnique({ where: { shortCode: record.shortCode } });
      expect(unchanged?.originalUrl).toBe(`https://${ALLOWED_HOST}/a`);
    });

    it('should update an existing URL to a host inside the allowlist', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: `https://${ALLOWED_HOST}/a`, shortCode: 'allowed4' },
      });
      const updatedUrl = `https://${ALLOWED_HOST}/path`;

      const response = await request(app.getHttpServer())
        .put(`/api/urls/${record.shortCode}`)
        .send({ url: updatedUrl })
        .expect(HttpStatus.OK);

      expect(response.body.originalUrl).toBe(updatedUrl);
      expect(response.body.shortCode).toBe(record.shortCode);

      const updated = await prisma.url.findUnique({ where: { shortCode: record.shortCode } });
      expect(updated?.originalUrl).toBe(updatedUrl);
    });
  });

  describe('GET /:shortCode', () => {
    it('should redirect a URL inside the allowlist', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/urls')
        .send({ url: `https://${ALLOWED_HOST}/path` })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .get(`/${created.body.shortCode}`)
        .expect(HttpStatus.FOUND)
        .expect('Location', `https://${ALLOWED_HOST}/path`);

      // recordClick is fire-and-forget; waiting keeps it from racing the next test's TRUNCATE.
      await waitFor(async () => {
        const clicks = await prisma.urlClick.count();
        return clicks >= 1 ? clicks : null;
      });
    });

    it('should return 404, not 302, for a stored target outside the allowlist', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: 'https://notallowed.com/phish', shortCode: 'legacy01' },
      });

      await request(app.getHttpServer()).get(`/${record.shortCode}`).expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for a stored subdomain target because matching is exact', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: `https://sub.${ALLOWED_HOST}/a`, shortCode: 'legacy02' },
      });

      await request(app.getHttpServer()).get(`/${record.shortCode}`).expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for a stored non-http(s) target', async () => {
      const record = await prisma.url.create({
        data: { originalUrl: `ftp://${ALLOWED_HOST}/file`, shortCode: 'legacy03' },
      });

      await request(app.getHttpServer()).get(`/${record.shortCode}`).expect(HttpStatus.NOT_FOUND);
    });
  });
});
