import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { PrismaService } from '../prisma/prisma.service';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/prisma/client';

// mock naoid package to avoid generating actual short URLs during testing
jest.mock('nanoid', () => {
  return {
    nanoid: jest.fn(),
  };
});
const mockNanoid = nanoid as jest.Mock;

describe('UrlsService', () => {
  let service: UrlsService;

  // mock PrismaService to avoid actual database calls during testing
  let prisma: PrismaService;
  const mockPrismaService = {
    url: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,

        // provide the mock PrismaService instead of the actual one
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UrlsService>(UrlsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks(); // clear mocks before each test to avoid interference
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should return a short URL when original URL is already in the database', async () => {
      const dto = { url: 'https://example.com' };

      const existingUrl = { originalUrl: dto.url, shortUrl: 'abc123' };
      mockPrismaService.url.findUnique.mockResolvedValue(existingUrl);

      const result = await service.create(dto);

      expect(prisma.url.findUnique).toHaveBeenCalledWith({
        where: { originalUrl: dto.url },
      });
      expect(prisma.url.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingUrl);
    });

    it('should create a new short URL(use nanoid) when the original URL is not in the database', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      const mockShortUrl = 'abc123';
      mockNanoid.mockReturnValue(mockShortUrl);

      const newUrl = { originalUrl: dto.url, shortUrl: mockShortUrl };
      mockPrismaService.url.create.mockResolvedValue(newUrl);

      const result = await service.create(dto);

      expect(mockNanoid).toHaveBeenCalledWith(UrlsService.SHORT_URL_LENGTH);
      expect(prisma.url.create).toHaveBeenCalledWith({
        data: { originalUrl: dto.url, shortUrl: mockShortUrl },
      });
      expect(result).toEqual(newUrl);
    });

    it('should retry generating a unique short URL if P2002 shortUrl conflict occurs', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      const shortUrl1 = 'conflict1';
      const shortUrl2 = 'success2';
      mockNanoid.mockReturnValueOnce(shortUrl1).mockReturnValueOnce(shortUrl2);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`shortUrl`)',
        {
          code: 'P2002',
          clientVersion: '0.0.0',
          meta: { target: ['shortUrl'] },
        },
      );

      mockPrismaService.url.create
        .mockRejectedValueOnce(p2002Error) // first attempt fails with P2002
        .mockResolvedValueOnce({ originalUrl: dto.url, shortUrl: shortUrl2 }); // second attempt succeeds

      const result = await service.create(dto);

      expect(prisma.url.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ originalUrl: dto.url, shortUrl: shortUrl2 });
    });

    it('should return existing URL if P2002 originalUrl conflict occurs', async () => {
      const dto = { url: 'https://example.com' };

      const existingUrl = { originalUrl: dto.url, shortUrl: 'existingShortUrl' };
      mockPrismaService.url.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUrl); // return existing URL on second call

      const shortUrl1 = 'conflict1';
      mockNanoid.mockReturnValueOnce(shortUrl1);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`originalUrl`)',
        {
          code: 'P2002',
          clientVersion: '0.0.0',
          meta: { target: ['originalUrl'] },
        },
      );

      mockPrismaService.url.create.mockRejectedValueOnce(p2002Error); // first attempt fails with P2002

      const result = await service.create(dto);

      expect(prisma.url.create).toHaveBeenCalledTimes(1);
      expect(prisma.url.findUnique).toHaveBeenCalledTimes(2);
      expect(result).toEqual(existingUrl);
    });

    it('should throw InternalServerErrorException for other database errors', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      mockNanoid.mockReturnValue('anyShortUrl');

      mockPrismaService.url.create.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.create(dto)).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw ConflictException if unable to generate a unique short URL after max retries', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      mockNanoid.mockReturnValue('conflictShortUrl');

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`shortUrl`)',
        {
          code: 'P2002',
          clientVersion: '0.0.0',
          meta: { target: ['shortUrl'] },
        },
      );

      mockPrismaService.url.create.mockRejectedValue(p2002Error); // always fail with P2002

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockNanoid).toHaveBeenCalledTimes(UrlsService.MAX_RETRIES);
    });
  });
});
