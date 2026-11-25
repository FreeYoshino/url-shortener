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

describe('API surface — admin API disabled (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        UrlsModule.register({ adminApi: false, allowedHosts: [] }),
      ],
    })
      // This suite only cares about which routes exist; Redis is not needed.
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

  it('should not mount PUT /api/urls/:shortCode', async () => {
    const record = await prisma.url.create({
      data: { originalUrl: 'https://example.com', shortCode: 'surface1' },
    });

    await request(app.getHttpServer())
      .put(`/api/urls/${record.shortCode}`)
      .send({ url: 'https://updated.example.com' })
      .expect(HttpStatus.NOT_FOUND);

    const unchanged = await prisma.url.findUnique({ where: { shortCode: record.shortCode } });
    expect(unchanged?.originalUrl).toBe('https://example.com');
  });

  it('should not mount DELETE /api/urls/:shortCode', async () => {
    const record = await prisma.url.create({
      data: { originalUrl: 'https://example.com', shortCode: 'surface2' },
    });

    await request(app.getHttpServer())
      .delete(`/api/urls/${record.shortCode}`)
      .expect(HttpStatus.NOT_FOUND);

    await expect(
      prisma.url.findUnique({ where: { shortCode: record.shortCode } }),
    ).resolves.not.toBeNull();
  });

  it('should not mount GET /api/urls/:shortCode/statistics', async () => {
    const record = await prisma.url.create({
      data: { originalUrl: 'https://example.com', shortCode: 'surface3' },
    });

    await request(app.getHttpServer())
      .get(`/api/urls/${record.shortCode}/statistics`)
      .expect(HttpStatus.NOT_FOUND);
  });

  it('should keep the core routes working', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/urls')
      .send({ url: 'https://example.com' })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .get(`/api/urls/${created.body.shortCode}`)
      .expect(HttpStatus.OK);

    await request(app.getHttpServer()).get(`/${created.body.shortCode}`).expect(HttpStatus.FOUND);

    // recordClick is fire-and-forget; waiting keeps it from racing the next suite.
    await waitFor(async () => {
      const clicks = await prisma.urlClick.count();
      return clicks >= 1 ? clicks : null;
    });
  });
});
