// Exposed so apps/api-e2e can boot this app's real module graph in-process (Nest
// TestingModule + supertest) instead of driving a separately served instance — see
// ARCHITECTURE.md §2's allowed-dependency table (`apps/api-e2e` -> `apps/api`,
// `contracts` only — never `database` directly) and
// apps/api-e2e/src/support/test-app.ts.
export { AppModule } from './app/app.module.js';
export { configureApp } from './app/configure-app.js';
export { GoogleAuthGuard } from './auth/guards/google-auth.guard.js';
export { SESSION_COOKIE_NAME } from './auth/constants.js';
export type { GoogleProfile, JwtPayload } from './auth/types.js';

// AccessControlService is exercised directly (not only through HTTP) by
// apps/api-e2e's unit-style suite — see AGENTS.md Part 1 ("Unit-test this service
// directly, not only through endpoints").
export { AccessControlService } from './access-control/access-control.service.js';
export type { AccessLevel } from './access-control/access-control.types.js';

// Pure passthrough — apps/api-e2e may depend on apps/api and contracts, but not
// directly on libs/database (see the table above and eslint.config.mjs's
// `@nx/enforce-module-boundaries` depConstraints). Re-exporting here is what lets e2e
// tests seed/clean up fixtures through the same PrismaService the app itself uses,
// without api-e2e taking on a direct `type:data` dependency.
export { PrismaService } from '@dataroom/database';
