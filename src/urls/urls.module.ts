import { Module } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { UrlsController } from './urls.controller';
import { RedirectController } from './redirect.controller';

@Module({
  providers: [UrlsService],
  controllers: [UrlsController, RedirectController],
})
export class UrlsModule {}
