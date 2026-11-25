import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateUrlDto } from './dto/create-url.dto';
import { UrlsService } from './urls.service';
import { Throttle } from '@nestjs/throttler';
import { THROTTLER_LIMITS } from '../throttler/throttler-limits';

@Controller('urls')
export class UrlsController {
  private readonly urlsService: UrlsService;

  constructor(urlsService: UrlsService) {
    this.urlsService = urlsService;
  }

  @Post()
  @Throttle({ default: { limit: THROTTLER_LIMITS.WRITE_LIMIT } })
  create(@Body() dto: CreateUrlDto) {
    return this.urlsService.create(dto);
  }

  @Get(':shortCode')
  get(@Param('shortCode') shortCode: string) {
    return this.urlsService.findByShortCode(shortCode);
  }
}
