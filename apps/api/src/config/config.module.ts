import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './env.schema.js';

/**
 * Global, validated configuration. `ConfigModule.forRoot`'s `validate` hook runs
 * synchronously while Nest builds the module graph — before any provider (including
 * `PrismaService`, which reads `DATABASE_URL` in its constructor) is instantiated — so a
 * missing or malformed env var throws at boot, never at first request.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
