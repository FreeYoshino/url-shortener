import { Test, TestingModule } from '@nestjs/testing';
import { RedirectController } from './redirect.controller';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';
import { NotFoundException, HttpStatus } from '@nestjs/common';
import { URLS_MODULE_OPTIONS, UrlsModuleOptions } from './urls-module.options';

describe('RedirectController', () => {
  let controller: RedirectController;

  // mock UrlsService to avoid actual database calls during testing
  let urlsService: UrlsService;
  const mockUrlsService = {
    requireUrlRecord: jest.fn(),
  };

  // mock AnalyticsService to avoid actual database calls during testing
  let analyticsService: AnalyticsService;
  const mockAnalyticsService = {
    recordClick: jest.fn(),
  };

  const shortCode = 'shortCode123';
  const mockUrlRecord = {
    id: 'urlId123',
    originalUrl: 'https://example.com',
    shortCode: 'shortCode123',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedirectController],
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

    controller = module.get<RedirectController>(RedirectController);
    urlsService = module.get<UrlsService>(UrlsService);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);

    jest.clearAllMocks(); // Clear mock calls before each test
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('redirect', () => {
    it('should call urlsService.requireUrlRecord with the given shortCode', async () => {
      mockUrlsService.requireUrlRecord.mockResolvedValue(mockUrlRecord);
      await controller.redirect(shortCode);

      expect(urlsService.requireUrlRecord).toHaveBeenCalledTimes(1);
      expect(urlsService.requireUrlRecord).toHaveBeenCalledWith(shortCode);
    });

    it('should return redirect object with original URL and HttpStatus.FOUND status code', async () => {
      mockUrlsService.requireUrlRecord.mockResolvedValue(mockUrlRecord);
      const result = await controller.redirect(shortCode);

      expect(result).toEqual({
        url: mockUrlRecord.originalUrl,
        statusCode: HttpStatus.FOUND,
      });
    });

    it('should trigger analyticsService.recordClick with url id asynchronously', async () => {
      mockUrlsService.requireUrlRecord.mockResolvedValue(mockUrlRecord);

      await controller.redirect(shortCode);

      expect(analyticsService.recordClick).toHaveBeenCalledTimes(1);
      expect(analyticsService.recordClick).toHaveBeenCalledWith(mockUrlRecord.id);
    });

    it('should propagate NotFoundException thrown by urlsService.requireUrlRecord', async () => {
      mockUrlsService.requireUrlRecord.mockRejectedValue(new NotFoundException());
      await expect(controller.redirect(shortCode)).rejects.toThrow(NotFoundException);

      expect(urlsService.requireUrlRecord).toHaveBeenCalled();
    });
  });

  describe('allowlist backstop', () => {
    /**
     * The helper function to build a RedirectController instance with the provided options.
     *
     * @param options - The UrlsModuleOptions to be injected into the RedirectController.
     * @returns A Promise resolving to a new instance of RedirectController.
     */
    async function buildController(options: UrlsModuleOptions): Promise<RedirectController> {
      const module = await Test.createTestingModule({
        controllers: [RedirectController],
        providers: [
          { provide: UrlsService, useValue: mockUrlsService },
          { provide: AnalyticsService, useValue: mockAnalyticsService },
          { provide: URLS_MODULE_OPTIONS, useValue: options },
        ],
      }).compile();

      return module.get<RedirectController>(RedirectController);
    }

    it('should throw NotFoundException if the original URL is not in the allowed hosts list', async () => {
      const controller = await buildController({ adminApi: true, allowedHosts: ['allowed.com'] });
      mockUrlsService.requireUrlRecord.mockResolvedValue({
        ...mockUrlRecord,
        originalUrl: 'https://notallowed.com',
      });

      await expect(controller.redirect(shortCode)).rejects.toThrow(NotFoundException);
      expect(analyticsService.recordClick).not.toHaveBeenCalled();
    });

    it('should redirect normally if the original URL is in the allowed hosts list', async () => {
      const controller = await buildController({ adminApi: true, allowedHosts: ['allowed.com'] });
      mockUrlsService.requireUrlRecord.mockResolvedValue({
        ...mockUrlRecord,
        originalUrl: 'https://allowed.com',
      });

      await expect(controller.redirect(shortCode)).resolves.toEqual({
        url: 'https://allowed.com',
        statusCode: HttpStatus.FOUND,
      });
    });
  });
});
