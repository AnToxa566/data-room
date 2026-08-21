import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { FileStatus, PrismaService } from '@dataroom/database';
import type {
  CreateFolderBody,
  FolderChildItem,
  FolderStats,
  UpdateFolderBody,
} from '@dataroom/contracts';

import { AccessControlService } from '../access-control/access-control.service.js';
import { decodeCursor, encodeCursor } from '../common/cursor.util.js';
import { escapeLikePattern } from '../common/like-escape.util.js';
import { isUniqueConstraintViolation } from '../common/prisma-error.util.js';
import { toFileChildDto } from '../files/file.mapper.js';
import { StorageService } from '../storage/storage.service.js';

import { toFolderChildDto, toFolderDto, toFolderWithBreadcrumbsDto } from './folder.mapper.js';
import { parsePathIds } from './path.util.js';

/**
 * A combined folder+file listing is paginated as one virtual sequence — every folder
 * (sorted by name, id), then every READY file (sorted by name, id). The cursor's `kind`
 * says which segment it resumes: `folder`/`file` carry the last returned (name, id) in
 * that segment; `files-start` is the sentinel for "every folder has been listed, resume
 * files from the beginning" — needed because a page can end exactly on the last folder,
 * with nothing yet consumed from the file segment to anchor a (name, id) cursor to. See
 * AGENTS.md's iteration 4 instructions ("verify with a test that pages through a folder
 * containing both").
 */
const FolderChildCursorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('folder'), name: z.string(), id: z.string().uuid() }),
  z.object({ kind: z.literal('files-start') }),
  z.object({ kind: z.literal('file'), name: z.string(), id: z.string().uuid() }),
]);
type FolderChildCursor = z.infer<typeof FolderChildCursorSchema>;

export interface ListFolderChildrenResult {
  items: FolderChildItem[];
  nextCursor: string | null;
}

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly storage: StorageService,
  ) {}

  /**
   * `parentId` is required — there is no "create at root" special case; to create a
   * top-level folder, the caller passes the Data Room's `rootFolderId`. See AGENTS.md
   * Part 3.
   */
  async create(userId: string, body: CreateFolderBody) {
    await this.accessControl.requireAccess(userId, 'DATA_ROOM', body.dataRoomId, 'OWNER');

    // A parent that doesn't exist, or that exists in a different Data Room, is the same
    // client error: this scopes the lookup to `dataRoomId` and collapses both cases into
    // one 400 rather than silently writing across rooms. See AGENTS.md Part 3.
    const parent = await this.prisma.folder.findFirst({
      where: { id: body.parentId, dataRoomId: body.dataRoomId },
    });
    if (!parent) {
      throw new BadRequestException('parentId does not belong to dataRoomId.');
    }

    try {
      const folder = await this.prisma.$transaction(async (tx) => {
        // path embeds this row's own id, which doesn't exist until after the insert —
        // same two-step pattern as the Data Room root folder. See ARCHITECTURE.md §4.
        const created = await tx.folder.create({
          data: {
            name: body.name,
            dataRoomId: body.dataRoomId,
            parentId: parent.id,
            path: '',
            depth: parent.depth + 1,
          },
        });
        return tx.folder.update({
          where: { id: created.id },
          data: { path: `${parent.path}${created.id}/` },
        });
      });
      return toFolderDto(folder);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          `A folder named "${body.name}" already exists here.`,
        );
      }
      throw error;
    }
  }

  /**
   * `VIEWER` minimum, not `OWNER` — this is a read, so the owner, an `EDITOR`/`VIEWER`
   * grantee, and an anonymous public-link visitor (`userId: null`, resolved through an
   * active `PUBLIC` share — see `AccessControlService`) can all reach it. Contrast
   * `create`/`update`/`delete` below, which stay `OWNER`-only: `EDITOR` write
   * enforcement is a stated non-goal this iteration (ARCHITECTURE.md §9).
   */
  async get(userId: string | null, id: string) {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'VIEWER');
    const folder = await this.findOrThrow(id);

    // Ancestor ids come from parsing `path` (root-first, self-last), then a single query
    // fetches every ancestor row — never a parentId loop. See AGENTS.md Part 3.
    const ancestorIds = parsePathIds(folder.path);
    const ancestors = await this.prisma.folder.findMany({
      where: { id: { in: ancestorIds } },
      select: { id: true, name: true },
    });
    const byId = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
    const breadcrumbs = ancestorIds
      .map((ancestorId) => byId.get(ancestorId))
      .filter((ancestor): ancestor is { id: string; name: string } => ancestor !== undefined);

    return toFolderWithBreadcrumbsDto(folder, breadcrumbs);
  }

  /** `VIEWER` minimum — see `get`'s doc comment. */
  async children(
    userId: string | null,
    id: string,
    query: { cursor?: string; limit: number },
  ): Promise<ListFolderChildrenResult> {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'VIEWER');
    const cursor: FolderChildCursor | null = query.cursor
      ? decodeCursor(query.cursor, FolderChildCursorSchema)
      : null;

    const items: FolderChildItem[] = [];

    // Folders sort before files — skip the folder query entirely once a 'file' or
    // 'files-start' cursor says that segment is already exhausted.
    if (cursor === null || cursor.kind === 'folder') {
      const folders = await this.prisma.folder.findMany({
        where: {
          parentId: id,
          ...(cursor
            ? {
                OR: [
                  { name: { gt: cursor.name } },
                  { AND: [{ name: cursor.name }, { id: { gt: cursor.id } }] },
                ],
              }
            : {}),
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      });

      const hasMore = folders.length > query.limit;
      const page = hasMore ? folders.slice(0, query.limit) : folders;
      items.push(...page.map(toFolderChildDto));

      if (hasMore) {
        const last = page.at(-1);
        if (last) {
          return {
            items,
            nextCursor: encodeCursor({ kind: 'folder', name: last.name, id: last.id }),
          };
        }
      }
    }

    // Either the folder segment is now fully exhausted (this call or an earlier one), or
    // we're resuming mid-file-list. Always issue this query — even with zero remaining
    // budget — so a page that ends exactly on the last folder still learns whether any
    // file exists, rather than reporting `nextCursor: null` while files go unlisted.
    const remaining = query.limit - items.length;
    const fileCursor = cursor?.kind === 'file' ? cursor : null;
    const files = await this.prisma.file.findMany({
      where: {
        folderId: id,
        status: FileStatus.READY,
        ...(fileCursor
          ? {
              OR: [
                { name: { gt: fileCursor.name } },
                { AND: [{ name: fileCursor.name }, { id: { gt: fileCursor.id } }] },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: remaining + 1,
    });

    const hasMoreFiles = files.length > remaining;
    const filePage = hasMoreFiles ? files.slice(0, remaining) : files;
    items.push(...filePage.map(toFileChildDto));

    let nextCursor: string | null = null;
    if (hasMoreFiles) {
      const last = filePage.at(-1);
      // `last` is defined whenever `remaining > 0` (filePage then has `remaining` items).
      // When `remaining === 0`, filePage is empty but a file still exists beyond this
      // page — resume from the very start of the file segment next time.
      nextCursor = last
        ? encodeCursor({ kind: 'file', name: last.name, id: last.id })
        : encodeCursor({ kind: 'files-start' });
    }

    return { items, nextCursor };
  }

  /** `VIEWER` minimum — see `get`'s doc comment. */
  async stats(userId: string | null, id: string): Promise<FolderStats> {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'VIEWER');
    const folder = await this.findOrThrow(id);

    // Prefix range over the materialized path, not recursion — see ARCHITECTURE.md
    // "How it scales". `path` is left-anchored and indexed, so this is an index scan.
    // The folder's own row matches its own path with the `%` consuming nothing, so it's
    // included in the count, per AGENTS.md Part 3 ("including the folder itself"). One
    // round trip for all three aggregates, so they reflect the same snapshot.
    const pattern = `${escapeLikePattern(folder.path)}%`;
    const rows = await this.prisma.$queryRaw<
      { folder_count: bigint; file_count: bigint; total_size: bigint }[]
    >`
      SELECT
        (SELECT COUNT(*)::bigint FROM folders WHERE path LIKE ${pattern}) AS folder_count,
        (SELECT COUNT(*)::bigint FROM files f
           JOIN folders d ON d.id = f."folderId"
           WHERE d.path LIKE ${pattern} AND f.status = 'READY') AS file_count,
        (SELECT COALESCE(SUM(f.size), 0)::bigint FROM files f
           JOIN folders d ON d.id = f."folderId"
           WHERE d.path LIKE ${pattern} AND f.status = 'READY') AS total_size
    `;
    const row = rows[0];

    return {
      totalSize: (row?.total_size ?? 0n).toString(),
      fileCount: Number(row?.file_count ?? 0n),
      folderCount: Number(row?.folder_count ?? 0n),
    };
  }

  async update(userId: string, id: string, body: UpdateFolderBody) {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'OWNER');
    const folder = await this.findOrThrow(id);
    if (folder.parentId === null) {
      throw new BadRequestException('The root folder cannot be renamed.');
    }

    try {
      const updated = await this.prisma.folder.update({
        where: { id },
        data: { name: body.name },
      });
      return toFolderDto(updated);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          `A folder named "${body.name}" already exists here.`,
        );
      }
      throw error;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'OWNER');
    const folder = await this.findOrThrow(id);
    if (folder.parentId === null) {
      throw new BadRequestException(
        'The root folder can only be deleted with its Data Room.',
      );
    }

    // Collected *before* the delete — once the folder (and its FK-cascaded subtree) is
    // gone, there is nothing left to query. See ARCHITECTURE.md §5.
    const pattern = `${escapeLikePattern(folder.path)}%`;
    const subtreeFiles = await this.prisma.$queryRaw<{ storageKey: string }[]>`
      SELECT f."storageKey" AS "storageKey" FROM files f
      JOIN folders d ON d.id = f."folderId"
      WHERE d.path LIKE ${pattern}
    `;

    // Cascades to the entire subtree — folders and files — via the FK constraints
    // already in the schema. Deliberately not deleting children by hand.
    await this.prisma.folder.delete({ where: { id } });

    // Storage cleanup after the transaction commits — database-before-storage ordering,
    // see ARCHITECTURE.md §5. Individual deletes, not a prefix delete: a file's
    // storageKey is `datarooms/{dataRoomId}/{fileId}` (flat, not nested by folder), so
    // there's no folder-scoped prefix to delete by — contrast DataRoomsService.delete.
    await Promise.all(subtreeFiles.map((file) => this.storage.deleteObject(file.storageKey)));
  }

  private async findOrThrow(id: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      // Access was already confirmed a moment ago — this only fires on a genuine race
      // (deleted between the check and this fetch). Still 404, never a raw 500.
      throw new NotFoundException('Folder not found.');
    }
    return folder;
  }
}
