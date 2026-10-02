import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatisticsUrlDto } from './dto/statistics-url.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger: Logger = new Logger(AnalyticsService.name);
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  /**
   * Records a click event for a URL.
   *
   * @param urlId - The ID of the URL that was clicked.
   * @returns A promise that resolves when the click has been recorded or the failure has been logged.
   */
  async recordClick(urlId: string): Promise<void> {
    try {
      await this.prisma.urlClick.create({
        data: {
          urlId: urlId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : 'No stack trace available';

      this.logger.warn(`Failed to record click for URL ID ${urlId}: ${message}`, stack);
    }
  }

  async getStatistics(shortCode: string): Promise<StatisticsUrlDto> {
    const record = await this.prisma.url.findUnique({
      where: { shortCode },
      include: {
        _count: {
          select: { clicks: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Short Code '${shortCode}' not found.`);
    }

    return {
      id: record.id,
      shortCode: record.shortCode,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      accessCount: record._count.clicks,
    };
  }
}
