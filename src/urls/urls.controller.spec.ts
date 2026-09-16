import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { UrlsController } from './urls.controller';
import { UrlsService } from './urls.service';
import { CreateUrlDto } from './dto/create-url.dto';
import { ResponseUrlDto } from './dto/response-url.dto';

describe('UrlsController', () => {
  let controller: UrlsController;

  // mock UrlsService to avoid actual database calls during testing
  let urlsService: UrlsService;
  const mockUrlsService = {
    create: jest.fn(),
  };

  const dto: CreateUrlDto = { url: 'https://example.com' };
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');
  const responseDto: ResponseUrlDto = {
    originalUrl: dto.url,
    shortCode: 'abc123',
    shortUrl: 'http://localhost:3000/abc123',
    createdAt,
    updatedAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UrlsController],
      providers: [
        {
          provide: UrlsService,
          useValue: mockUrlsService,
        },
      ],
    }).compile();

    controller = module.get<UrlsController>(UrlsController);
    urlsService = module.get<UrlsService>(UrlsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call urlsService.create with the given dto', async () => {
      mockUrlsService.create.mockResolvedValue(responseDto);

      await controller.create(dto);

      expect(urlsService.create).toHaveBeenCalledTimes(1);
      expect(urlsService.create).toHaveBeenCalledWith(dto);
    });

    it('should return the service result with no reshape or wrapping', async () => {
      mockUrlsService.create.mockResolvedValue(responseDto);

      const result = await controller.create(dto);

      expect(result).toEqual(responseDto);
    });

    it('should propagate InternalServerErrorException thrown by urlsService.create', async () => {
      mockUrlsService.create.mockRejectedValue(new InternalServerErrorException('db down'));

      await expect(controller.create(dto)).rejects.toThrow(InternalServerErrorException);
    });

    it('should propagate ConflictException thrown by urlsService.create', async () => {
      mockUrlsService.create.mockRejectedValue(new ConflictException('conflict'));

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });
});
