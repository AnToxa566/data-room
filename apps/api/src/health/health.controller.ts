import { Controller, Logger } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';
import { PrismaService } from '@dataroom/database';

import { Public } from '../auth/decorators/public.decorator.js';

/**
 * Liveness/readiness endpoint for Cloud Run — see ARCHITECTURE.md's decision log and
 * README.md "Deployment". `@Public()` because the global `JwtAuthGuard` (registered as
 * `APP_GUARD` in AuthModule) protects every route by default, and Cloud Run's probe
 * carries no session cookie.
 */
@Public()
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @TsRestHandler(contract.health)
  handler() {
    return tsRestHandler(contract.health, {
      check: async () => {
        try {
          // Trivial round trip against the already-open, shared connection pool —
          // never a fresh PrismaClient, never held open beyond this one query.
          await this.prisma.$queryRaw`SELECT 1`;
          return { status: 200 as const, body: { status: 'ok' as const, database: 'connected' as const } };
        } catch (error) {
          this.logger.error(
            'Health check DB query failed',
            error instanceof Error ? error.stack : String(error),
          );
          return {
            status: 503 as const,
            body: { status: 'error' as const, database: 'disconnected' as const },
          };
        }
      },
    });
  }
}
