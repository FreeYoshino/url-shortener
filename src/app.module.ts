import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UrlsModule } from './urls/urls.module';
import { AppThrottlerModule } from './throttler/app-throttler.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    UrlsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AppThrottlerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
