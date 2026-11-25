import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { UpdateUrlDto } from './dto/update-url.dto';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';

@Controller('urls')
export class AdminUrlsController {
  private readonly urlsService: UrlsService;
  private readonly analyticsService: AnalyticsService;

  constructor(urlsService: UrlsService, analyticsService: AnalyticsService) {
    this.urlsService = urlsService;
    this.analyticsService = analyticsService;
  }

  @Delete(':shortCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('shortCode') shortCode: string) {
    await this.urlsService.delete(shortCode);
  }

  @Put(':shortCode')
  update(@Param('shortCode') shortCode: string, @Body() dto: UpdateUrlDto) {
    return this.urlsService.update(shortCode, dto);
  }

  @Get(':shortCode/statistics')
  getStatistics(@Param('shortCode') shortCode: string) {
    return this.analyticsService.getStatistics(shortCode);
  }
}
