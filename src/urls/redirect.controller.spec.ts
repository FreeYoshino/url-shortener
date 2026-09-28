import { Test, TestingModule } from '@nestjs/testing';
import { RedirectController } from './redirect.controller';
import { UrlsService } from './urls.service';
import { CreateUrlDto } from './dto/create-url.dto';
import { ResponseUrlDto } from './dto/response-url.dto';
import { NotFoundException, HttpStatus } from '@nestjs/common';

describe('RedirectController', () => {
  let controller: RedirectController;

  // mock UrlsService to avoid actual database calls during testing
  let urlsService: UrlsService;
  const mockUrlsService = {
    findByShortCode: jest.fn(),
  };

  const shortCode = 'shortCode123';
  const dto: CreateUrlDto = { url: 'https://example.com' };
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');
  const responseDto: ResponseUrlDto = {
    originalUrl: dto.url,
    shortCode: 'abc123',
    createdAt,
    updatedAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedirectController],
      providers: [
        {
          provide: UrlsService,
          useValue: mockUrlsService,
        },
      ],
    }).compile();

    controller = module.get<RedirectController>(RedirectController);
    urlsService = module.get<UrlsService>(UrlsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('redirect', () => {
    it('should call urlsService.findByShortCode with the given shortCode', async () => {
      mockUrlsService.findByShortCode.mockResolvedValue(responseDto);
      await controller.redirect(shortCode);

      expect(urlsService.findByShortCode).toHaveBeenCalledTimes(1);
      expect(urlsService.findByShortCode).toHaveBeenCalledWith(shortCode);
    });

    it('should return redirect object with original URL and HttpStatus.FOUND status code', async () => {
      mockUrlsService.findByShortCode.mockResolvedValue(responseDto);
      const result = await controller.redirect(shortCode);

      expect(result).toEqual({
        url: responseDto.originalUrl,
        statusCode: HttpStatus.FOUND,
      });
    });

    it('should propagate NotFoundException thrown by urlsService.findByShortCode', async () => {
      mockUrlsService.findByShortCode.mockRejectedValue(new NotFoundException());
      await expect(controller.redirect(shortCode)).rejects.toThrow(NotFoundException);
    });
  });
});
