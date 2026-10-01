import { Controller, Post, Body } from '@nestjs/common';
import { CreateUrlDto } from './dto/create-url.dto';
import { UrlsService } from './urls.service';

@Controller('urls')
export class UrlsController {
  private readonly urlsService: UrlsService;

  constructor(urlsService: UrlsService) {
    this.urlsService = urlsService;
  }

  @Post()
  create(@Body() dto: CreateUrlDto) {
    return this.urlsService.create(dto);
  }
}
