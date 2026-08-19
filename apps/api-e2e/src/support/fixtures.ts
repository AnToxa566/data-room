import { JwtService } from '@nestjs/jwt';

// See the identical comment in ./test-app.ts — documented exception to
// `@nx/enforce-module-boundaries`'s "no app imports" default, per ARCHITECTURE.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PrismaService, SESSION_COOKIE_NAME } from '@dataroom/api';

/**
 * Shared fixture helpers for apps/api-e2e specs that need an authenticated user —
 * pulled out of the pattern in ../auth/auth.e2e.spec.ts so the data-rooms, folders, and
 * access-control suites don't each redeclare it.
 */

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function seedUser(prisma: PrismaService, label = 'seed') {
  return prisma.user.create({
    data: {
      email: uniqueEmail(label),
      googleId: `google-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `E2E ${label} user`,
    },
  });
}

export function sessionCookieFor(
  jwtService: JwtService,
  user: { id: string; email: string },
): string {
  const token = jwtService.sign({ sub: user.id, email: user.email });
  return `${SESSION_COOKIE_NAME}=${token}`;
}
