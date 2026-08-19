import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService } from '@dataroom/database';
import type {
  CreateDataRoomBody,
  DataRoomListItem,
  UpdateDataRoomBody,
} from '@dataroom/contracts';

import { AccessControlService } from '../access-control/access-control.service.js';
import { decodeCursor, encodeCursor } from '../common/cursor.util.js';
import { dataRoomStoragePrefix } from '../files/storage-key.util.js';
import { StorageService } from '../storage/storage.service.js';

import { toDataRoomDto, toDataRoomListItemDto } from './data-room.mapper.js';

/** The name every Data Room's root folder is created with. Not user-facing as a "name"
 * in the usual sense — the root can never be renamed (ARCHITECTURE.md §4). */
const ROOT_FOLDER_NAME = '/';

const DataRoomCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});

export interface ListDataRoomsResult {
  items: DataRoomListItem[];
  nextCursor: string | null;
}

@Injectable()
export class DataRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Creation is transactional and two-step because the root folder's `path` embeds its
   * own id, which doesn't exist until the row is inserted — see ARCHITECTURE.md §4 and
   * AGENTS.md Part 2. `rootFolderId` is null only inside this transaction; it must never
   * be observably null outside it.
   */
  async create(ownerId: string, body: CreateDataRoomBody) {
    const dataRoom = await this.prisma.$transaction(async (tx) => {
      const room = await tx.dataRoom.create({
        data: { name: body.name, ownerId },
      });

      const rootFolder = await tx.folder.create({
        data: {
          name: ROOT_FOLDER_NAME,
          dataRoomId: room.id,
          parentId: null,
          path: '', // placeholder — path embeds this row's own id, set once it exists
          depth: 0,
        },
      });

      const rootFolderWithPath = await tx.folder.update({
        where: { id: rootFolder.id },
        data: { path: `/${rootFolder.id}/` },
      });

      return tx.dataRoom.update({
        where: { id: room.id },
        data: { rootFolderId: rootFolderWithPath.id },
      });
    });

    return toDataRoomDto(dataRoom);
  }

  async list(
    ownerId: string,
    query: { cursor?: string; limit: number },
  ): Promise<ListDataRoomsResult> {
    // Shared-with-me arrives in iteration 5 — see AGENTS.md Part 2. This response shape
    // doesn't need to change then, only the `where` clause and each item's `access`.
    const cursor = query.cursor ? decodeCursor(query.cursor, DataRoomCursorSchema) : null;

    const rooms = await this.prisma.dataRoom.findMany({
      where: {
        ownerId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  AND: [
                    { createdAt: new Date(cursor.createdAt) },
                    { id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const hasMore = rooms.length > query.limit;
    const page = hasMore ? rooms.slice(0, query.limit) : rooms;
    const last = page.at(-1);

    return {
      items: page.map((room) => toDataRoomListItemDto(room, 'OWNER')),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(userId: string, id: string) {
    await this.accessControl.requireAccess(userId, 'DATA_ROOM', id, 'OWNER');
    return toDataRoomDto(await this.findOrThrow(id));
  }

  async update(userId: string, id: string, body: UpdateDataRoomBody) {
    await this.accessControl.requireAccess(userId, 'DATA_ROOM', id, 'OWNER');
    const dataRoom = await this.prisma.dataRoom.update({
      where: { id },
      data: { name: body.name },
    });
    return toDataRoomDto(dataRoom);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.accessControl.requireAccess(userId, 'DATA_ROOM', id, 'OWNER');

    // Cascades to every Folder and File in the room via the FK constraints already in
    // the schema (see ARCHITECTURE.md §4) — deliberately not deleting children by hand.
    await this.prisma.dataRoom.delete({ where: { id } });

    // Storage cleanup after the transaction commits — see ARCHITECTURE.md §5's
    // database-before-storage ordering. A whole-room delete is a single prefix delete
    // (unlike a folder delete's per-file cleanup, see FoldersService.delete) because
    // every file's storageKey lives under `datarooms/{dataRoomId}/` regardless of which
    // folder it was in.
    await this.storage.deleteByPrefix(dataRoomStoragePrefix(id));
  }

  private async findOrThrow(id: string) {
    const dataRoom = await this.prisma.dataRoom.findUnique({ where: { id } });
    if (!dataRoom) {
      // Access was already confirmed a moment ago — this only fires on a genuine race
      // (deleted between the check and this fetch). Still 404, never a raw 500.
      throw new NotFoundException('Data Room not found.');
    }
    return dataRoom;
  }
}
