import { Module } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';
import { UrlsController } from './urls.controller';
import { RedirectController } from './redirect.controller';

@Module({
  providers: [UrlsService, AnalyticsService],
  controllers: [UrlsController, RedirectController],
})
export class UrlsModule {}
