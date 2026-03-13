import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {
    const host = configService.get<string>('database.host');
    const port = configService.get<number>('database.port');
    const username = configService.get<string>('database.username');
    const password = encodeURIComponent(configService.get<string>('database.password'));
    const database = configService.get<string>('database.name');
    const ssl = configService.get<boolean>('database.ssl');

    const url = `postgresql://${username}:${password}@${host}:${port}/${database}?schema=public${ssl ? '&sslmode=require' : ''}`;
    process.env.DATABASE_URL = process.env.DATABASE_URL || url;
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}