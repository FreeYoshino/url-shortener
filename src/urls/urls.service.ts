import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUrlDto } from './dto/create-url.dto';

/**
 * Service responsible for managing URL shortening operations.
 */
@Injectable()
export class UrlsService {
  private readonly prisma: PrismaService;

  /** Default length of the generated short URL. */
  static SHORT_URL_LENGTH = 8;

  /** Maximum number of retries for generating a unique short URL. */
  static MAX_RETRIES = 5;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  /**
   * Creates a shortened URL record or retrieves an existing one.
   *
   * Flows:
   * 1. Check if the original URL already exists; return the existing record if found.
   * 2. Generate a unique short URL using {@link nanoid}.
   * 3. Attempts to persist the record.
   *      If a unique constraint violation (`P2002`) occurs,
   *      retries up to {@link UrlsService.MAX_RETRIES} times.
   *
   * @param dto - Data Transfer Object containing the original URL to be shortened.
   * @returns The existing or newly created URL record.
   *
   * @throws {ConflictException} If a unique short URL cannot be generated.
   * @throws {InternalServerErrorException} If a database operation fails.
   */
  async create(dto: CreateUrlDto) {
    const originalUrl = dto.url;

    // Check if the original URL already exists in the database
    const existingUrl = await this.prisma.url.findUnique({
      where: { originalUrl },
    });
    if (existingUrl) return existingUrl;

    // Generate a unique short URL
    for (let attempt = 0; attempt < UrlsService.MAX_RETRIES; attempt++) {
      const shortUrl = nanoid(UrlsService.SHORT_URL_LENGTH);

      // Check if the generated short URL already exists in the database
      try {
        return await this.prisma.url.create({
          data: { originalUrl, shortUrl },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = error.meta?.target;
          const isShortUrlConflict = Array.isArray(target)
            ? target.includes('shortUrl')
            : target === 'shortUrl';

          if (isShortUrlConflict) continue; // Short URL already exists, try again

          // If the conflict is on the original URL, return the existing record
          return await this.prisma.url.findUnique({
            where: { originalUrl },
          });
        }

        throw new InternalServerErrorException('Database operation failed.');
      }
    }

    // If all attempts to generate a unique short URL fail, throw a conflict exception
    throw new ConflictException('Unable to generate a unique short URL. Please try again later.');
  }
}
