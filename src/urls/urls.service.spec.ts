import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { PrismaService } from '../prisma/prisma.service';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/prisma/client';

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
    },
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

    it('should throw InternalServerErrorException for other database errors', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      mockNanoid.mockReturnValue('anyShortCode');

      mockPrismaService.url.create.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.create(dto)).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw ConflictException if unable to generate a unique short code after max retries', async () => {
      const dto = { url: 'https://example.com' };

      mockPrismaService.url.findUnique.mockResolvedValue(null);

      mockNanoid.mockReturnValue('conflictCode');

      mockPrismaService.url.create.mockRejectedValue(uniqueViolation()); // always fail with P2002

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockNanoid).toHaveBeenCalledTimes(UrlsService.MAX_RETRIES);
    });
  });
});
