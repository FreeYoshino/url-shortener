import { Module } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';
import { UrlCacheService } from './url-cache.service';
import { UrlsController } from './urls.controller';
import { RedirectController } from './redirect.controller';

@Module({
  providers: [UrlsService, AnalyticsService, UrlCacheService],
  controllers: [UrlsController, RedirectController],
})
export class UrlsModule {}
