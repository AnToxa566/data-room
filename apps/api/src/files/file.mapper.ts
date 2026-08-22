import type { File as ContractFile, FileChildItem, FileWithAccessContext } from '@dataroom/contracts';
import type { File as PrismaFile } from '@dataroom/database';

import type { ShareContext } from '../access-control/access-control.types.js';

/** The only place a Prisma `File` becomes a wire response — see `toFolderDto` for the
 * identical pattern. `size` crosses the wire as a string (BigInt in Postgres/Prisma) —
 * see ARCHITECTURE.md §7. */
export function toFileDto(file: PrismaFile): ContractFile {
  return {
    id: file.id,
    name: file.name,
    dataRoomId: file.dataRoomId,
    folderId: file.folderId,
    size: file.size.toString(),
    mimeType: file.mimeType,
    status: file.status,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

/** `GET /files/:id`'s response shape — `toFileDto` plus the caller's access context.
 * Unlike folders, a file's `sharedRootType` can legitimately be `'FILE'` (a share
 * directly on the file itself) — no narrowing needed, all three `ShareResourceType`
 * variants are valid here. */
export function toFileWithAccessContextDto(
  file: PrismaFile,
  shareContext: ShareContext,
): FileWithAccessContext {
  return {
    ...toFileDto(file),
    isOwner: shareContext.isOwner,
    sharedByEmail: shareContext.sharedByEmail,
    sharedRootType: shareContext.sharedRootType,
  };
}

/** A file as it appears in `GET /folders/:id/children` — the narrower listing shape, not
 * the full `FileSchema`. See folders.ts's comment on `FileChildSchema`. */
export function toFileChildDto(file: PrismaFile): FileChildItem {
  return {
    kind: 'file',
    id: file.id,
    name: file.name,
    size: file.size.toString(),
    mimeType: file.mimeType,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}
