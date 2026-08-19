import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { defineConfig } from 'prisma/config';

// Root .env is loaded explicitly (relative to this file) so `prisma generate` /
// `prisma migrate` work the same whether Nx invokes them from the workspace root
// or from this package's own directory.
loadEnv({ path: join(import.meta.dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations run over the DIRECT connection (port 5432) — pgBouncer in
    // transaction-pooling mode (DATABASE_URL, port 6543) cannot run migrations.
    // The application's PrismaClient uses DATABASE_URL instead, via the pg driver
    // adapter constructed in PrismaService — that path never goes through this file.
    url: process.env['DIRECT_URL'],
  },
});
