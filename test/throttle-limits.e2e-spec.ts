import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

describe('Throttle Limits', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Re set the throttle limits from environment variables
    process.env.THROTTLE_WRITE_LIMIT = '2';
    process.env.THROTTLE_REDIRECT_LIMIT = '2';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);

    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    // Start every test from an empty table. `UrlClick` is named explicitly so
    // the truncation does not depend on the FK's ON DELETE action.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "UrlClick", "Url" CASCADE');
  });
  afterAll(async () => {
    // app.close() triggers PrismaService.onModuleDestroy, which disconnects
    await app.close();
  });

  describe('POST /api/urls limits come from environment variables', () => {
    const route = '/api/urls';

    it('should return 429 when POST /api/urls limit is exceeded', async () => {
      await request(app.getHttpServer()).post(route).send({}).expect(HttpStatus.BAD_REQUEST);
      await request(app.getHttpServer()).post(route).send({}).expect(HttpStatus.BAD_REQUEST);
      await request(app.getHttpServer()).post(route).send({}).expect(HttpStatus.TOO_MANY_REQUESTS);
    });
  });

  describe('GET /:shortCode limits come from environment variables', () => {
    const route = '/anyShortCode';

    it('should return 429 when GET /:shortCode limit is exceeded', async () => {
      await request(app.getHttpServer()).get(route).expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer()).get(route).expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer()).get(route).expect(HttpStatus.TOO_MANY_REQUESTS);
    });
  });
});
