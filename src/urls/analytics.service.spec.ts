import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  // mock PrismaService to avoid actual database calls during testing
  let prisma: PrismaService;
  const mockPrismaService = {
    urlClick: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,

        // provide the mock PrismaService instead of the actual one
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks(); // clear mocks before each test to avoid interference
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordClick', () => {
    it('should call prisma.urlClick.create with the correct urlId', async () => {
      const urlId = 'test-url-id';
      await service.recordClick(urlId);

      expect(prisma.urlClick.create).toHaveBeenCalledWith({
        data: { urlId },
      });
    });

    it('should log a warning if prisma.urlClick.create throws an error', async () => {
      const urlId = 'test-url-id';

      const mockError = new Error('Database error');
      mockPrismaService.urlClick.create.mockRejectedValue(mockError);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(service.recordClick(urlId)).resolves.not.toThrow();

      // Check that the logger was called with the expected message
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to record click for URL ID ${urlId}: ${mockError.message}`),
        mockError.stack,
      );

      loggerSpy.mockRestore(); // restore the original implementation of the logger
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const urlId = 'test-url-id';

      const mockError = 'Some string error';
      mockPrismaService.urlClick.create.mockRejectedValue(mockError);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(service.recordClick(urlId)).resolves.not.toThrow();

      // Check that the logger was called with the expected message
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to record click for URL ID ${urlId}: ${mockError}`),
        'No stack trace available',
      );

      loggerSpy.mockRestore(); // restore the original implementation of the logger
    });
  });
});
