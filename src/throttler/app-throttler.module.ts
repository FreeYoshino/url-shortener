import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler-storage';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (configService: ConfigService, redisService: RedisService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('THROTTLE_TTL_MS', 60000),
            limit: configService.get<number>('THROTTLE_LIMIT', 30),
          },
        ],
        errorMessage: 'Too many requests, please try again later.',
        storage: new RedisThrottlerStorage(redisService),

        // TODO: Add Custom Tracker to avoid docker container IPs being counted as unique users
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppThrottlerModule {}
