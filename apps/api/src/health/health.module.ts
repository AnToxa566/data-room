import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';

/**
 * Liveness/readiness endpoint for Cloud Run. `PrismaService` is injected straight from
 * the `@Global()` PrismaModule (see libs/database) — no providers of its own beyond the
 * controller.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
