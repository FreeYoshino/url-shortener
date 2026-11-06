import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

/**
 * Closes a test application and its external clients.
 *
 * RedisService.onModuleDestroy uses `disconnect()`, which can leave a
 * half-open socket. Quitting a still-connected client first releases it.
 * Prisma is disconnected explicitly before the Nest lifecycle runs so that
 * teardown is deterministic for apps created ad hoc inside a test.
 *
 * Only use this with applications built from AppModule, since it looks up
 * RedisService and PrismaService.
 */
export async function closeApp(app: INestApplication): Promise<void> {
  const redisService = app.get(RedisService);
  const prismaService = app.get(PrismaService);

  try {
    if (redisService.client.status === 'ready') {
      await redisService.client.quit();
    }
  } finally {
    try {
      await prismaService.$disconnect();
    } finally {
      await app.close();
    }
  }
}
