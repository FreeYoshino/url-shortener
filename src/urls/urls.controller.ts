import {
  Controller,
  Post,
  Body,
  Delete,
  HttpStatus,
  Param,
  HttpCode,
  Put,
  Get,
} from '@nestjs/common';
import { CreateUrlDto } from './dto/create-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';

@Controller('urls')
export class UrlsController {
  private readonly urlsService: UrlsService;
  private readonly analyticsService: AnalyticsService;

  constructor(urlsService: UrlsService, analyticsService: AnalyticsService) {
    this.urlsService = urlsService;
    this.analyticsService = analyticsService;
  }

  @Post()
  create(@Body() dto: CreateUrlDto) {
    return this.urlsService.create(dto);
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

  @Get(':shortCode')
  get(@Param('shortCode') shortCode: string) {
    return this.urlsService.findByShortCode(shortCode);
  }

  @Get(':shortCode/statistics')
  getStatistics(@Param('shortCode') shortCode: string) {
    return this.analyticsService.getStatistics(shortCode);
  }
}
