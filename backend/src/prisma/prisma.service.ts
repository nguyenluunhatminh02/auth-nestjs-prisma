import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {
    const host = configService.get<string>('database.host');
    const port = configService.get<number>('database.port');
    const username = configService.get<string>('database.username');
    const password = configService.get<string>('database.password');
    const database = configService.get<string>('database.name');
    const ssl = configService.get<boolean>('database.ssl');

    const url = `postgresql://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public${ssl ? '&sslmode=require' : ''}`;
    process.env.DATABASE_URL = process.env.DATABASE_URL || url;

    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}