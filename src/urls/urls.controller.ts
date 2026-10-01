import { Controller, Post, Body, Delete, HttpStatus, Param, HttpCode } from '@nestjs/common';
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

  @Delete(':shortCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('shortCode') shortCode: string) {
    await this.urlsService.delete(shortCode);
  }
}
