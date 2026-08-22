import type {
  Breadcrumb,
  Folder as ContractFolder,
  FolderChildItem,
  FolderWithBreadcrumbs,
  SharedRootType,
} from '@dataroom/contracts';
import type { Folder as PrismaFolder } from '@dataroom/database';

import type { ShareContext } from '../access-control/access-control.types.js';

/** The only place a Prisma `Folder` becomes a wire response — see `toUserDto` for the
 * same pattern applied to `User`. */
export function toFolderDto(folder: PrismaFolder): ContractFolder {
  return {
    id: folder.id,
    name: folder.name,
    dataRoomId: folder.dataRoomId,
    parentId: folder.parentId,
    path: folder.path,
    depth: folder.depth,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

/**
 * A folder's `shareCandidates` can only ever be `DATA_ROOM`/`FOLDER`-typed (see
 * `AccessControlService.resolveResourceContext`'s `FOLDER` branch, which never builds a
 * `FILE` candidate) — a folder can never resolve a `FILE`-typed share boundary. This
 * turns that structural invariant into a checked narrowing instead of an unsafe cast,
 * so a future change to the candidate-building logic that broke it would fail loudly
 * here rather than silently mis-typing the wire response.
 */
function toFolderSharedRootType(sharedRootType: ShareContext['sharedRootType']): SharedRootType | null {
  if (sharedRootType === 'FILE') {
    throw new Error('Unreachable: a folder resolved a FILE-typed share boundary.');
  }
  return sharedRootType;
}

export function toFolderWithBreadcrumbsDto(
  folder: PrismaFolder,
  breadcrumbs: Breadcrumb[],
  dataRoomName: string,
  shareContext: ShareContext,
): FolderWithBreadcrumbs {
  return {
    ...toFolderDto(folder),
    breadcrumbs,
    isRoot: folder.parentId === null,
    dataRoomName,
    isOwner: shareContext.isOwner,
    sharedByEmail: shareContext.sharedByEmail,
    sharedRootType: toFolderSharedRootType(shareContext.sharedRootType),
  };
}

/** A folder as it appears in `GET /folders/:id/children` — the narrower listing shape,
 * not the full `FolderSchema`. See folders.ts's comment on `FolderChildSchema`. */
export function toFolderChildDto(folder: PrismaFolder): FolderChildItem {
  return {
    kind: 'folder',
    id: folder.id,
    name: folder.name,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}
