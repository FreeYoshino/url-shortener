import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { PrismaService } from '../prisma/prisma.service';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/prisma/client';
import { UrlCacheService } from './url-cache.service';

// mock naoid package to avoid generating actual short codes during testing
jest.mock('nanoid', () => {
  return {
    nanoid: jest.fn(),
  };
});
const mockNanoid = nanoid as jest.Mock;

/**
 * Builds a `P2002` error the way Prisma 7 + `@prisma/adapter-pg` actually
 * raises it.
 *
 * Note there is no `meta.target`: under the driver adapter that field is
 * `undefined` and the constraint only appears at
 * `meta.driverAdapterError.cause.constraint.index`. The service must not depend
 * on either, which is exactly what these tests pin down.
 */
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '0.0.0',
    meta: {
      modelName: 'Url',
      driverAdapterError: {
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { index: 'Url_shortCode_key' },
          table: 'Url',
        },
      },
    },
  });
}

describe('UrlsService', () => {
  let service: UrlsService;

  // mock PrismaService to avoid actual database calls during testing
  let prisma: PrismaService;
  const mockPrismaService = {
    url: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };

  let urlCacheService: UrlCacheService;
  const mockUrlCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  // fixed values used to assert the ResponseUrlDto output
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,

        // provide the mock PrismaService instead of the actual one
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: UrlCacheService,
          useValue: mockUrlCacheService,
        },
      ],
    }).compile();

    service = module.get<UrlsService>(UrlsService);
    prisma = module.get<PrismaService>(PrismaService);
    urlCacheService = module.get<UrlCacheService>(UrlCacheService);

    jest.clearAllMocks(); // clear mocks before each test to avoid interference

    // Cache defaults: a miss, and no-op writes unless a test overrides them.
    mockUrlCacheService.get.mockReset().mockResolvedValue(null);
    mockUrlCacheService.set.mockReset().mockResolvedValue(undefined);
    mockUrlCacheService.invalidate.mockReset().mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should return the existing URL info when original URL is already in the database', async () => {
      const dto = { url: 'https://example.com' };

      const existingUrl = { originalUrl: dto.url, shortCode: 'abc123', createdAt, updatedAt };
      mockPrismaService.url.findUnique.mockResolvedValue(existingUrl);

      const result = await service.create(dto);

      expect(prisma.url.findUnique).toHaveBeenCalledWith({
        where: { originalUrl: dto.url },
      });
      expect(prisma.url.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        originalUrl: dto.url,
        shortCode: 'abc123',
        createdAt,
        updatedAt,
      });
    });

    it('should call urlCacheService.set when original URL is already in the database', async () => {
      const dto = { url: 'https://example.com' };

      const existingUrl = { originalUrl: dto.url, shortCode: 'abc123', createdAt, updatedAt };
      mockPrismaService.url.findUnique.mockResolvedValue(existingUrl);

      await service.create(dto);

      expect(urlCacheService.set).toHaveBeenCalledWith(existingUrl);
    });

    it('should create a new short code (use nanoid) when the original URL is not in the database', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      const mockShortCode = 'abc123';
      mockNanoid.mockReturnValue(mockShortCode);

      const newUrl = { originalUrl: dto.url, shortCode: mockShortCode, createdAt, updatedAt };
      mockPrismaService.url.create.mockResolvedValue(newUrl);

      const result = await service.create(dto);

      expect(mockNanoid).toHaveBeenCalledWith(UrlsService.SHORT_CODE_LENGTH);
      expect(prisma.url.create).toHaveBeenCalledWith({
        data: { originalUrl: dto.url, shortCode: mockShortCode },
      });
      expect(result).toEqual({
        originalUrl: dto.url,
        shortCode: mockShortCode,
        createdAt,
        updatedAt,
      });
    });

    it('should call urlCacheService.set when a new URL is created', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      const mockShortCode = 'abc123';
      mockNanoid.mockReturnValue(mockShortCode);

      const newUrl = { originalUrl: dto.url, shortCode: mockShortCode, createdAt, updatedAt };
      mockPrismaService.url.create.mockResolvedValue(newUrl);

      await service.create(dto);

      expect(urlCacheService.set).toHaveBeenCalledWith(newUrl);
    });

    it('should retry generating a unique short code if P2002 shortCode conflict occurs', async () => {
      const dto = { url: 'https://example.com' };

      // the lookup misses on both calls: the first is the pre-flight check,
      // the second is made from the catch block to rule out an originalUrl clash
      mockPrismaService.url.findUnique.mockResolvedValue(null);

      const shortCode1 = 'conflict1';
      const shortCode2 = 'success2';
      mockNanoid.mockReturnValueOnce(shortCode1).mockReturnValueOnce(shortCode2);

      mockPrismaService.url.create
        .mockRejectedValueOnce(uniqueViolation()) // first attempt fails with P2002
        .mockResolvedValueOnce({
          originalUrl: dto.url,
          shortCode: shortCode2,
          createdAt,
          updatedAt,
        }); // second attempt succeeds

      const result = await service.create(dto);

      expect(prisma.url.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        originalUrl: dto.url,
        shortCode: shortCode2,
        createdAt,
        updatedAt,
      });
      expect(urlCacheService.set).toHaveBeenCalledWith({
        originalUrl: dto.url,
        shortCode: shortCode2,
        createdAt,
        updatedAt,
      });
    });

    it('should return existing URL if P2002 originalUrl conflict occurs', async () => {
      const dto = { url: 'https://example.com' };

      const existingUrl = {
        originalUrl: dto.url,
        shortCode: 'existingCode',
        createdAt,
        updatedAt,
      };
      mockPrismaService.url.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUrl); // return existing URL on second call

      const shortCode1 = 'conflict1';
      mockNanoid.mockReturnValueOnce(shortCode1);

      mockPrismaService.url.create.mockRejectedValueOnce(uniqueViolation()); // first attempt fails with P2002

      const result = await service.create(dto);

      expect(prisma.url.create).toHaveBeenCalledTimes(1);
      expect(prisma.url.findUnique).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        originalUrl: dto.url,
        shortCode: 'existingCode',
        createdAt,
        updatedAt,
      });
    });

    it('should call urlCacheService.set when returning existing URL after P2002 originalUrl conflict', async () => {
      const dto = { url: 'https://example.com' };

      const existingUrl = {
        originalUrl: dto.url,
        shortCode: 'existingCode',
        createdAt,
        updatedAt,
      };
      mockPrismaService.url.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUrl); // return existing URL on second call

      const shortCode1 = 'conflict1';
      mockNanoid.mockReturnValueOnce(shortCode1);

      mockPrismaService.url.create.mockRejectedValueOnce(uniqueViolation()); // first attempt fails with P2002

      await service.create(dto);

      expect(urlCacheService.set).toHaveBeenCalledWith(existingUrl);
    });

    it('should throw InternalServerErrorException for other database errors', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      mockNanoid.mockReturnValue('anyShortCode');

      mockPrismaService.url.create.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.create(dto)).rejects.toThrow(InternalServerErrorException);
      expect(urlCacheService.set).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if unable to generate a unique short code after max retries', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      mockNanoid.mockReturnValue('conflictCode');

      mockPrismaService.url.create.mockRejectedValue(uniqueViolation()); // always fail with P2002

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockNanoid).toHaveBeenCalledTimes(UrlsService.MAX_RETRIES);
      expect(urlCacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('requireUrlRecord', () => {
    const shortCode = 'shortCode123';
    const urlRecord = {
      id: 'url-id',
      originalUrl: 'https://example.com',
      shortCode,
      createdAt,
      updatedAt,
    };

    it('should return the cached record without querying the database', async () => {
      mockUrlCacheService.get.mockResolvedValue(urlRecord);

      const result = await service.requireUrlRecord(shortCode);

      expect(result).toEqual(urlRecord);
      expect(mockUrlCacheService.get).toHaveBeenCalledWith(shortCode);
      expect(prisma.url.findUnique).not.toHaveBeenCalled();
      expect(mockUrlCacheService.set).not.toHaveBeenCalled();
    });

    it('should query the database on a cache miss and populate the cache', async () => {
      mockUrlCacheService.get.mockResolvedValue(null);
      mockPrismaService.url.findUnique.mockResolvedValue(urlRecord);

      const result = await service.requireUrlRecord(shortCode);

      expect(result).toEqual(urlRecord);
      expect(mockUrlCacheService.get).toHaveBeenCalledWith(shortCode);
      expect(prisma.url.findUnique).toHaveBeenCalledWith({ where: { shortCode } });
      expect(mockUrlCacheService.set).toHaveBeenCalledWith(urlRecord);
    });

    it('should throw NotFoundException and not cache a missing short code', async () => {
      mockUrlCacheService.get.mockResolvedValue(null);
      mockPrismaService.url.findUnique.mockResolvedValue(null);

      await expect(service.requireUrlRecord(shortCode)).rejects.toThrow(
        new NotFoundException(`Short Code '${shortCode}' not found.`),
      );
      expect(mockUrlCacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('findByShortCode', () => {
    const shortCode = 'shortCode123';
    const urlRecord = {
      id: 'url-id',
      originalUrl: 'https://example.com',
      shortCode,
      createdAt,
      updatedAt,
    };

    it('should return the URL info when the short code exists', async () => {
      mockPrismaService.url.findUnique.mockResolvedValue(urlRecord);

      const result = await service.findByShortCode(shortCode);

      expect(prisma.url.findUnique).toHaveBeenCalledWith({
        where: { shortCode },
      });
      expect(result).toEqual({
        originalUrl: 'https://example.com',
        shortCode,
        createdAt,
        updatedAt,
      });
      expect(mockUrlCacheService.set).toHaveBeenCalledWith(urlRecord);
    });

    it('should serve the response from cache without querying the database', async () => {
      mockUrlCacheService.get.mockResolvedValue(urlRecord);

      const result = await service.findByShortCode(shortCode);

      expect(result).toEqual({
        originalUrl: 'https://example.com',
        shortCode,
        createdAt,
        updatedAt,
      });
      expect(mockUrlCacheService.get).toHaveBeenCalledWith(shortCode);
      expect(prisma.url.findUnique).not.toHaveBeenCalled();
      expect(mockUrlCacheService.set).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the short code does not exist', async () => {
      const missingCode = 'nonExistentCode';
      mockPrismaService.url.findUnique.mockResolvedValue(null);

      await expect(service.findByShortCode(missingCode)).rejects.toThrow(
        new NotFoundException(`Short Code '${missingCode}' not found.`),
      );
    });
  });

  describe('delete', () => {
    it('should call the delete method when the short code exists', async () => {
      const shortCode = 'abc1234';
      mockPrismaService.url.delete.mockResolvedValue({ id: 1, shortCode });

      await expect(service.delete(shortCode)).resolves.not.toThrow();
      expect(prisma.url.delete).toHaveBeenCalledWith({ where: { shortCode } });
    });

    it('should call urlCacheService.invalidate when a URL is deleted', async () => {
      const shortCode = 'abc1234';
      mockPrismaService.url.delete.mockResolvedValue({ id: 1, shortCode });

      await service.delete(shortCode);

      expect(urlCacheService.invalidate).toHaveBeenCalledWith(shortCode);
    });

    it('should throw NotFoundException when the short code does not exist(P2025 occurrence)', async () => {
      const shortCode = 'nonExistentCode';
      mockPrismaService.url.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        }),
      );

      await expect(service.delete(shortCode)).rejects.toThrow(NotFoundException);
      expect(urlCacheService.invalidate).not.toHaveBeenCalled();
    });

    it('should throw error for other database errors and not invalidate the cache', async () => {
      const shortCode = 'abc1234';
      mockPrismaService.url.delete.mockRejectedValue(new Error('Database error'));

      await expect(service.delete(shortCode)).rejects.toThrow('Database error');
      expect(urlCacheService.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update the URL when the short code exists', async () => {
      const shortCode = 'abc1234';
      const updateDto = { url: 'https://updated.com' };
      const updatedUrlRecord = {
        originalUrl: updateDto.url,
        shortCode,
        createdAt,
        updatedAt,
      };

      mockPrismaService.url.update.mockResolvedValue(updatedUrlRecord);

      const result = await service.update(shortCode, updateDto);

      expect(prisma.url.update).toHaveBeenCalledWith({
        where: { shortCode },
        data: { originalUrl: updateDto.url },
      });
      expect(result).toEqual({
        originalUrl: updateDto.url,
        shortCode,
        createdAt,
        updatedAt,
      });
    });

    it('should call urlCacheService.invalidate when a URL is updated', async () => {
      const shortCode = 'abc1234';
      const updateDto = { url: 'https://updated.com' };
      const updatedUrlRecord = {
        originalUrl: updateDto.url,
        shortCode,
        createdAt,
        updatedAt,
      };

      mockPrismaService.url.update.mockResolvedValue(updatedUrlRecord);

      await service.update(shortCode, updateDto);

      expect(urlCacheService.invalidate).toHaveBeenCalledWith(shortCode);
    });

    it('should throw NotFoundException when the short code does not exist', async () => {
      const shortCode = 'nonExistentCode';
      const updateDto = { url: 'https://updated.com' };

      mockPrismaService.url.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        }),
      );

      await expect(service.update(shortCode, updateDto)).rejects.toThrow(NotFoundException);
      expect(urlCacheService.invalidate).not.toHaveBeenCalled();
    });

    it('should throw error for other database errors and not invalidate the cache', async () => {
      const shortCode = 'abc1234';
      const updateDto = { url: 'https://updated.com' };
      mockPrismaService.url.update.mockRejectedValue(new Error('Database error'));

      await expect(service.update(shortCode, updateDto)).rejects.toThrow('Database error');
      expect(urlCacheService.invalidate).not.toHaveBeenCalled();
    });
  });
});
