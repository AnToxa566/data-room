import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * Liveness/readiness probe for Cloud Run — see ARCHITECTURE.md's decision log and
 * README.md "Deployment". `database` reflects a single `SELECT 1` against the existing
 * shared PrismaService connection pool, never a fresh PrismaClient. `200` is the healthy
 * path; `503` on a DB failure, so this is usable as an actual Cloud Run health-check
 * target, not just an always-200 liveness ping.
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['connected', 'disconnected']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const healthContract = c.router({
  check: {
    method: 'GET',
    path: '/health',
    responses: {
      200: HealthResponseSchema,
      503: HealthResponseSchema,
    },
    summary: 'Liveness/readiness probe — public, no session required.',
  },
});
