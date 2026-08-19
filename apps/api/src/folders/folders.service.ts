import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService } from '@dataroom/database';
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

import { toFolderChildDto, toFolderDto, toFolderWithBreadcrumbsDto } from './folder.mapper.js';
import { parsePathIds } from './path.util.js';

const FolderChildCursorSchema = z.object({
  name: z.string(),
  id: z.string().uuid(),
});

export interface ListFolderChildrenResult {
  items: FolderChildItem[];
  nextCursor: string | null;
}

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
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

  async get(userId: string, id: string) {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'OWNER');
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

  async children(
    userId: string,
    id: string,
    query: { cursor?: string; limit: number },
  ): Promise<ListFolderChildrenResult> {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'OWNER');
    const cursor = query.cursor
      ? decodeCursor(query.cursor, FolderChildCursorSchema)
      : null;

    // Files are iteration 4 — only `kind: 'folder'` rows exist today, but the envelope
    // shape (and the `kind` discriminant) is final now. See AGENTS.md Part 3.
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
    const last = page.at(-1);

    return {
      items: page.map(toFolderChildDto),
      nextCursor: hasMore && last ? encodeCursor({ name: last.name, id: last.id }) : null,
    };
  }

  async stats(userId: string, id: string): Promise<FolderStats> {
    await this.accessControl.requireAccess(userId, 'FOLDER', id, 'OWNER');
    const folder = await this.findOrThrow(id);

    // Prefix range over the materialized path, not recursion — see ARCHITECTURE.md
    // "How it scales". `path` is left-anchored and indexed, so this is an index scan.
    // The folder's own row matches its own path with the `%` consuming nothing, so it's
    // included in the count, per AGENTS.md Part 3 ("including the folder itself").
    const pattern = `${escapeLikePattern(folder.path)}%`;
    const rows = await this.prisma.$queryRaw<{ folder_count: bigint }[]>`
      SELECT COUNT(*)::bigint AS folder_count FROM folders WHERE path LIKE ${pattern}
    `;
    const folderCount = Number(rows[0]?.folder_count ?? 0n);

    return {
      // TODO(iteration 4): sum File.size (status = READY) over the same path prefix,
      // joined through folders — see README.md "How it scales". The query above is
      // already shaped so adding that join doesn't change this endpoint's response.
      totalSize: '0',
      fileCount: 0,
      folderCount,
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

    // Cascades to the entire subtree — folders and files — via the FK constraints
    // already in the schema. Deliberately not deleting children by hand.
    //
    // TODO(iteration 4): files in this subtree still have blobs in GCS. Deleting the
    // rows here doesn't delete the objects — storage cleanup is out of scope for this
    // iteration.
    await this.prisma.folder.delete({ where: { id } });
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
