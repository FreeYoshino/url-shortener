import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UrlsModule } from './urls/urls.module';
import { AppThrottlerModule } from './throttler/app-throttler.module';
import { RedisModule } from './redis/redis.module';
import { parseAllowedHosts } from './urls/allowed-hosts';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    UrlsModule.register({
      adminApi: process.env.ADMIN_API !== 'false',
      allowedHosts: parseAllowedHosts(process.env.DEMO_ALLOWED_HOSTS),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AppThrottlerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
