import type {
  Breadcrumb,
  Folder as ContractFolder,
  FolderChildItem,
  FolderWithBreadcrumbs,
} from '@dataroom/contracts';
import type { Folder as PrismaFolder } from '@dataroom/database';

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

export function toFolderWithBreadcrumbsDto(
  folder: PrismaFolder,
  breadcrumbs: Breadcrumb[],
): FolderWithBreadcrumbs {
  return {
    ...toFolderDto(folder),
    breadcrumbs,
    isRoot: folder.parentId === null,
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
