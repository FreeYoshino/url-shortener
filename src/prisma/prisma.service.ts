import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    const pool = new Pool({
      connectionString: connectionString,
    });
    const adapter = new PrismaPg({
      connectionString: connectionString,
    });

    super({ adapter });

    this.pool = pool;
  }

  async onModuleInit() {
    // Connect to the database when the module is initialized
    await this.$connect();
  }
}
