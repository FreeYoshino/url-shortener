import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, Throttle } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';

// A simple test controller for throttler tests
@Controller('test-throttler')
class TestThrottlerController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('Throttler E2E', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: 60000,
            limit: 2,
          },
        ]),
      ],

      controllers: [TestThrottlerController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 429 when limit is exceeded', async () => {
    const server = app.getHttpServer();

    // Make 2 successful requests
    await request(server).get('/test-throttler').expect(HttpStatus.OK);
    await request(server).get('/test-throttler').expect(HttpStatus.OK);

    // The 3rd request should exceed the limit and return 429
    await request(server).get('/test-throttler').expect(HttpStatus.TOO_MANY_REQUESTS);
  });
});
