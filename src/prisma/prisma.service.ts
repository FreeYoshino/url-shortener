import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    // PrismaPg owns the underlying pg Pool: it builds one from the connection
    // string and closes it on `$disconnect()`.
    const adapter = new PrismaPg({
      connectionString: connectionString,
    });

    super({ adapter });
  }

  async onModuleInit() {
    // Connect to the database when the module is initialized
    await this.$connect();
  }

  async onModuleDestroy() {
    // Close the database connection when the module is destroyed
    await this.$disconnect();
  }
}
