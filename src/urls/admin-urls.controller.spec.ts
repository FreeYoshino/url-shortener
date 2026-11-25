import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminUrlsController } from './admin-urls.controller';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';
import { ResponseUrlDto } from './dto/response-url.dto';
import { StatisticsUrlDto } from './dto/statistics-url.dto';
import { URLS_MODULE_OPTIONS } from './urls-module.options';

describe('AdminUrlsController', () => {
  let controller: AdminUrlsController;

  // mock UrlsService to avoid actual database calls during testing
  let urlsService: UrlsService;
  const mockUrlsService = {
    delete: jest.fn(),
    update: jest.fn(),
  };

  // mock AnalyticsService to avoid actual database calls during testing
  let analyticsService: AnalyticsService;
  const mockAnalyticsService = {
    getStatistics: jest.fn(),
  };

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');
  const responseDto: ResponseUrlDto = {
    originalUrl: 'https://example.com',
    shortCode: 'abc123',
    createdAt,
    updatedAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUrlsController],
      providers: [
        {
          provide: UrlsService,
          useValue: mockUrlsService,
        },
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
        {
          provide: URLS_MODULE_OPTIONS,
          useValue: { adminApi: true, allowedHosts: [] }, // Mocked options for testing
        },
      ],
    }).compile();

    controller = module.get<AdminUrlsController>(AdminUrlsController);
    urlsService = module.get<UrlsService>(UrlsService);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);

    jest.clearAllMocks(); // clear mocks before each test to avoid interference
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('delete', () => {
    it('should call urlsService.delete with the given shortCode', async () => {
      const shortCode = 'shortCode123';
      mockUrlsService.delete.mockResolvedValue(undefined);

      await controller.delete(shortCode);

      expect(urlsService.delete).toHaveBeenCalledTimes(1);
      expect(urlsService.delete).toHaveBeenCalledWith(shortCode);
    });

    it('should return undefined when urlsService.delete resolves successfully', async () => {
      const shortCode = 'shortCode123';
      mockUrlsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(shortCode);

      expect(result).toBeUndefined();
    });

    it('should propagate NotFoundException thrown by urlsService.delete', async () => {
      const shortCode = 'nonExistentCode';
      mockUrlsService.delete.mockRejectedValue(new NotFoundException('not found'));

      await expect(controller.delete(shortCode)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should call urlsService.update with the given shortCode and dto', async () => {
      const shortCode = 'shortCode123';
      const updateDto = { url: 'https://updated.com' };
      mockUrlsService.update.mockResolvedValue(responseDto);

      await controller.update(shortCode, updateDto);

      expect(urlsService.update).toHaveBeenCalledTimes(1);
      expect(urlsService.update).toHaveBeenCalledWith(shortCode, updateDto);
    });

    it('should return the service result with no reshape or wrapping', async () => {
      const shortCode = 'shortCode123';
      const updateDto = { url: 'https://updated.com' };
      mockUrlsService.update.mockResolvedValue(responseDto);

      const result = await controller.update(shortCode, updateDto);

      expect(result).toEqual(responseDto);
    });

    it('should propagate NotFoundException thrown by urlsService.update', async () => {
      const shortCode = 'nonExistentCode';
      const updateDto = { url: 'https://updated.com' };
      mockUrlsService.update.mockRejectedValue(new NotFoundException('not found'));

      await expect(controller.update(shortCode, updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatistics', () => {
    const shortCode = 'shortCode123';
    const statisticsDto: StatisticsUrlDto = {
      id: '1',
      shortCode,
      createdAt,
      updatedAt,
      accessCount: 10,
    };

    it('should call analyticsService.getStatistics with the given shortCode', async () => {
      mockAnalyticsService.getStatistics.mockResolvedValue(statisticsDto);

      await controller.getStatistics(shortCode);

      expect(analyticsService.getStatistics).toHaveBeenCalledTimes(1);
      expect(analyticsService.getStatistics).toHaveBeenCalledWith(shortCode);
    });

    it('should return the service result with no reshape or wrapping', async () => {
      mockAnalyticsService.getStatistics.mockResolvedValue(statisticsDto);

      const result = await controller.getStatistics(shortCode);

      expect(result).toEqual(statisticsDto);
    });

    it('should propagate NotFoundException thrown by analyticsService.getStatistics', async () => {
      mockAnalyticsService.getStatistics.mockRejectedValue(new NotFoundException('not found'));

      await expect(controller.getStatistics(shortCode)).rejects.toThrow(NotFoundException);
    });
  });
});
