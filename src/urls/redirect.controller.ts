import { Controller, Get, HttpStatus, Param, Redirect } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';

@Controller('')
export class RedirectController {
  private readonly urlsService: UrlsService;
  private readonly analyticsService: AnalyticsService;

  constructor(urlsService: UrlsService, analyticsService: AnalyticsService) {
    this.urlsService = urlsService;
    this.analyticsService = analyticsService;
  }

  @Get(':shortCode')
  @Redirect()
  async redirect(@Param('shortCode') shortCode: string) {
    const urlRecord = await this.urlsService.requireUrlRecord(shortCode);

    // Record the click event for analytics in the background
    this.analyticsService.recordClick(urlRecord.id);

    return {
      url: urlRecord.originalUrl,
      statusCode: HttpStatus.FOUND,
    };
  }
}
