import type { DataRoom as ContractDataRoom, DataRoomListItem } from '@dataroom/contracts';
import type { DataRoom as PrismaDataRoom } from '@dataroom/database';

import type { AccessLevel } from '../access-control/access-control.types.js';

/** The only place a Prisma `DataRoom` becomes a wire response — see `toUserDto` for the
 * same pattern applied to `User`. */
export function toDataRoomDto(dataRoom: PrismaDataRoom): ContractDataRoom {
  return {
    id: dataRoom.id,
    name: dataRoom.name,
    ownerId: dataRoom.ownerId,
    rootFolderId: dataRoom.rootFolderId,
    createdAt: dataRoom.createdAt.toISOString(),
    updatedAt: dataRoom.updatedAt.toISOString(),
  };
}

/**
 * `access` is `Exclude<AccessLevel, null>` at this call site by construction — a room
 * only appears in "list mine" because the caller already has some access to it.
 */
export function toDataRoomListItemDto(
  dataRoom: PrismaDataRoom,
  access: Exclude<AccessLevel, null>,
): DataRoomListItem {
  return { ...toDataRoomDto(dataRoom), access };
}
