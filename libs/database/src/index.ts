export * from './lib/prisma.service.js';
export * from './lib/prisma.module.js';

// Re-export of the generated Prisma types, for use inside apps/api only.
// apps/web must never import from @dataroom/database — see ARCHITECTURE.md §2.
export type {
  PrismaClient,
  User,
  DataRoom,
  Folder,
  File,
  Share,
} from './generated/prisma/client.js';
// Value export (not just `import type`) — apps/api needs `Prisma.PrismaClientKnownRequestError`
// at runtime to translate a unique-constraint violation (P2002) into a 409, per
// ARCHITECTURE.md's "catch the constraint violation, don't pre-check as the primary
// mechanism" rule.
export { Prisma } from './generated/prisma/client.js';
export {
  FileStatus,
  ShareResourceType,
  ShareRole,
} from './generated/prisma/enums.js';
