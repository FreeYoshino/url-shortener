import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma, Url } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUrlDto } from './dto/create-url.dto';
import { ResponseUrlDto } from './dto/response-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';

/**
 * Service responsible for managing URL shortening operations.
 */
@Injectable()
export class UrlsService {
  private readonly prisma: PrismaService;

  /** Default length of the generated short code. */
  static SHORT_CODE_LENGTH = 8;

  /** Maximum number of retries for generating a unique short code. */
  static MAX_RETRIES = 5;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  /**
   * Creates a shortened URL record or retrieves an existing one.
   *
   * Flows:
   * 1. Check if the original URL already exists; return the existing record if found.
   * 2. Generate a unique short code using {@link nanoid}.
   * 3. Attempts to persist the record.
   *      If a unique constraint violation (`P2002`) occurs,
   *      retries up to {@link UrlsService.MAX_RETRIES} times.
   *
   * @param dto - Data Transfer Object containing the original URL to be shortened.
   * @returns The created or existing URL Info as a {@link ResponseUrlDto}.
   *
   * @throws {ConflictException} If a unique short code cannot be generated.
   * @throws {InternalServerErrorException} If a database operation fails.
   */
  async create(dto: CreateUrlDto): Promise<ResponseUrlDto> {
    const originalUrl = dto.url;

    // Check if the original URL already exists in the database
    const existingUrl = await this.prisma.url.findUnique({
      where: { originalUrl },
    });
    if (existingUrl) return this.toResponseDto(existingUrl);

    // Generate a unique short code
    for (let attempt = 0; attempt < UrlsService.MAX_RETRIES; attempt++) {
      const shortCode = nanoid(UrlsService.SHORT_CODE_LENGTH);

      try {
        const newUrl = await this.prisma.url.create({
          data: { originalUrl, shortCode },
        });
        return this.toResponseDto(newUrl);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Either unique column can raise `P2002`. Looking the original URL up
          // tells the two apart: a hit means a concurrent request inserted it
          // first, a miss means the generated short code collided and a fresh
          // one should be tried.
          //
          // Deliberately not branching on `error.meta.target`: with the Prisma 7
          // driver adapter it is `undefined`, so such a check would silently
          // never match and every collision would surface as a 500.
          const record = await this.prisma.url.findUnique({
            where: { originalUrl },
          });
          if (record) return this.toResponseDto(record);

          continue; // Short code already exists, try again
        }

        throw new InternalServerErrorException('Database operation failed.');
      }
    }

    // If all attempts to generate a unique short code fail, throw a conflict exception
    throw new ConflictException('Unable to generate a unique short URL. Please try again later.');
  }

  /**
   * Converts a URL record to a response DTO.
   *
   * @param urlRecord - The URL record to convert.
   * @returns The converted response DTO.
   */
  private toResponseDto(urlRecord: Url): ResponseUrlDto {
    return {
      originalUrl: urlRecord.originalUrl,
      shortCode: urlRecord.shortCode,
      createdAt: urlRecord.createdAt,
      updatedAt: urlRecord.updatedAt,
    };
  }

  /**
   * Finds a URL by its short code.
   *
   * @param shortCode The short code to search for.
   * @returns A promise resolving to the found URL or rejecting with a NotFoundException if not found.
   *
   * @throws {NotFoundException} If the short code does not exist in the database.
   */
  async findByShortCode(shortCode: string): Promise<ResponseUrlDto> {
    const urlRecord = await this.prisma.url.findUnique({
      where: { shortCode },
    });

    if (!urlRecord) {
      throw new NotFoundException(`Short Code '${shortCode}' not found.`);
    }

    return this.toResponseDto(urlRecord);
  }

  /**
   * Deletes a URL record by its short code.
   *
   * @param shortCode - The short code of the URL record to delete.
   * @returns A promise that resolves when the URL record has been deleted.
   *
   * @throws {NotFoundException} If the short code does not exist in the database.
   */
  async delete(shortCode: string): Promise<void> {
    try {
      await this.prisma.url.delete({
        where: { shortCode },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Short Code '${shortCode}' not found.`);
      }

      throw error;
    }
  }

  /**
   * Updates a URL record by its short code.
   *
   * @param shortCode - The short code of the URL record to update.
   * @param updateDto - The data to update the URL record with.
   * @returns A promise resolving to the updated URL record or rejecting with a NotFoundException if not found.
   *
   * @throws {NotFoundException} If the short code does not exist in the database.
   */
  async update(shortCode: string, updateDto: UpdateUrlDto): Promise<ResponseUrlDto> {
    try {
      const urlRecord = await this.prisma.url.update({
        where: { shortCode },
        data: {
          originalUrl: updateDto.url,
        },
      });

      return this.toResponseDto(urlRecord);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Short Code '${shortCode}' not found.`);
      }

      throw error;
    }
  }
}
