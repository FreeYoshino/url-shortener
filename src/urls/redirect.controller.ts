import { Controller, Get, HttpStatus, Param, Redirect } from '@nestjs/common';
import { UrlsService } from './urls.service';

@Controller('')
export class RedirectController {
  private readonly urlsService: UrlsService;

  constructor(urlsService: UrlsService) {
    this.urlsService = urlsService;
  }

  @Get(':shortCode')
  @Redirect()
  async redirect(@Param('shortCode') shortCode: string) {
    const urlInfo = await this.urlsService.findByShortCode(shortCode);

    return {
      url: urlInfo.originalUrl,
      statusCode: HttpStatus.FOUND,
    };
  }
}
