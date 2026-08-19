export * from './lib/prisma.service.js';
export * from './lib/prisma.module.js';

// Re-export of the generated Prisma types, for use inside apps/api only.
// apps/web must never import from @dataroom/database — see ARCHITECTURE.md §2.
export type {
  Prisma,
  PrismaClient,
  User,
  DataRoom,
  Folder,
  File,
  Share,
} from './generated/prisma/client.js';
export {
  FileStatus,
  ShareResourceType,
  ShareRole,
} from './generated/prisma/enums.js';
