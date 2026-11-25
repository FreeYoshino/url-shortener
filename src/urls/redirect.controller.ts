import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Redirect,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';
import { Throttle } from '@nestjs/throttler';
import { THROTTLER_LIMITS } from '../throttler/throttler-limits';
import { isAllowedHost } from './allowed-hosts';
import { URLS_MODULE_OPTIONS } from './urls-module.options';
import type { UrlsModuleOptions } from './urls-module.options';

@Controller('')
export class RedirectController {
  private readonly urlsService: UrlsService;
  private readonly analyticsService: AnalyticsService;
  private readonly options: UrlsModuleOptions;

  constructor(
    urlsService: UrlsService,
    analyticsService: AnalyticsService,
    @Inject(URLS_MODULE_OPTIONS) options: UrlsModuleOptions,
  ) {
    this.urlsService = urlsService;
    this.analyticsService = analyticsService;
    this.options = options;
  }

  @Get(':shortCode')
  @Throttle({ default: { limit: THROTTLER_LIMITS.REDIRECT_LIMIT } })
  @Redirect()
  async redirect(@Param('shortCode') shortCode: string) {
    const urlRecord = await this.urlsService.requireUrlRecord(shortCode);

    // Backstop: throw NotFoundException if the original URL is not in the allowed hosts list
    if (!isAllowedHost(urlRecord.originalUrl, this.options.allowedHosts)) {
      throw new NotFoundException(`Short Code '${shortCode}' not found.`);
    }

    // Record the click event for analytics in the background
    this.analyticsService.recordClick(urlRecord.id);

    return {
      url: urlRecord.originalUrl,
      statusCode: HttpStatus.FOUND,
    };
  }
}
