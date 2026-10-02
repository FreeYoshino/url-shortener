import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
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
    url: {
      findUnique: jest.fn(),
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

  describe('getStatistics', () => {
    const shortCode = 'test-short-code';
    const mockRecord = {
      id: 'test-id',
      shortCode: shortCode,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { clicks: 5 },
    };

    it('should call prisma.url.findUnique with the shortCode', async () => {
      mockPrismaService.url.findUnique.mockResolvedValue(mockRecord);

      await service.getStatistics(shortCode);

      expect(prisma.url.findUnique).toHaveBeenCalledWith({
        where: { shortCode },
        include: {
          _count: {
            select: { clicks: true },
          },
        },
      });
      expect(prisma.url.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should return the correct StatisticsUrlDto when a record is found', async () => {
      mockPrismaService.url.findUnique.mockResolvedValue(mockRecord);

      const result = await service.getStatistics(shortCode);

      expect(result).toEqual({
        id: mockRecord.id,
        shortCode: mockRecord.shortCode,
        createdAt: mockRecord.createdAt,
        updatedAt: mockRecord.updatedAt,
        accessCount: mockRecord._count.clicks,
      });
    });

    it('should throw NotFoundException when no record is found', async () => {
      mockPrismaService.url.findUnique.mockResolvedValue(null);

      await expect(service.getStatistics(shortCode)).rejects.toThrow(NotFoundException);
    });
  });
});
