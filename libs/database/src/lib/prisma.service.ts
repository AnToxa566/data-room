import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Wraps the generated Prisma Client in a Nest-managed lifecycle.
 *
 * Uses the `@prisma/adapter-pg` driver adapter (mandatory in Prisma v7) pointed at
 * `DATABASE_URL` — the **pooled** Supabase connection (pgBouncer, port 6543). This is
 * deliberately different from the URL used by migrations (`DIRECT_URL`, configured in
 * `prisma.config.ts`): pgBouncer in transaction-pooling mode cannot run migrations, but
 * it is exactly what a request-scoped application connection wants.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set — required to construct the pg driver adapter.',
      );
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from the database.');
  }
}
