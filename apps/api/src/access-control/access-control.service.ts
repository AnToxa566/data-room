import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, type ShareResourceType } from '@dataroom/database';

import { ACCESS_RANK, type AccessLevel } from './access-control.types.js';

const RESOURCE_LABEL: Record<ShareResourceType, string> = {
  DATA_ROOM: 'Data Room',
  FOLDER: 'Folder',
  FILE: 'File',
};

/**
 * The single authorization point for the entire application. Every service and
 * controller routes access decisions through `resolveAccess`/`requireAccess` — no
 * service or controller anywhere may compare `ownerId` directly. Bypassing this once
 * defeats the whole point of the abstraction. See AGENTS.md Part 1.
 *
 * This iteration implements ownership only: a user has `OWNER` on a resource when they
 * own the Data Room it belongs to, otherwise `null`. Iteration 5 adds a second branch —
 * shares on the resource itself, any ancestor folder, or the Data Room, strongest role
 * wins (see ARCHITECTURE.md §4) — inside `resolveAccess`. Nothing outside this class
 * changes when that lands.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves what `userId` can do with `resourceId`. Returns `null` for both "doesn't
   * exist" and "exists but isn't yours (or shared with you)" — collapsing those two
   * cases is what lets `requireAccess` return `404` instead of `403` for either one. A
   * resource a user can't see must never be distinguishable, over the wire, from a
   * resource that was never there. See ARCHITECTURE.md §7.
   */
  async resolveAccess(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<AccessLevel> {
    const ownerId = await this.resolveOwnerId(resourceType, resourceId);
    if (ownerId === null) {
      return null;
    }
    if (ownerId === userId) {
      return 'OWNER';
    }

    // Sharing branch arrives in iteration 5 (ARCHITECTURE.md decision log). Until then,
    // anyone who isn't the owner has no access.
    return null;
  }

  /**
   * Resolves access and throws the right HTTP error instead of handing back a level for
   * every call site to check by hand.
   *
   * - No access at all -> `404`. The caller can't prove the resource exists, so nothing
   *   is revealed about it — see ARCHITECTURE.md §7.
   * - Some access, but weaker than `minimum` -> `403`. The caller provably knows the
   *   resource exists (they can already see it at a lower role), so `404` here would
   *   lie. This branch is unreachable in this iteration — ownership is all-or-nothing —
   *   but the distinction has to be correct from the start for iteration 5, where a
   *   `VIEWER` share can hit an `EDITOR`-or-above check.
   *
   * Returns the resolved level so callers that also need it (e.g. to decide what a
   * response includes) don't have to resolve twice.
   */
  async requireAccess(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
    minimum: Exclude<AccessLevel, null>,
  ): Promise<Exclude<AccessLevel, null>> {
    const access = await this.resolveAccess(userId, resourceType, resourceId);
    if (access === null) {
      throw new NotFoundException(`${RESOURCE_LABEL[resourceType]} not found.`);
    }
    if (ACCESS_RANK[access] < ACCESS_RANK[minimum]) {
      throw new ForbiddenException('You do not have permission to do that.');
    }
    return access;
  }

  /**
   * Looks up the `ownerId` of the Data Room a resource belongs to, in one query
   * regardless of resource type — a direct lookup for `DATA_ROOM`, a one-hop join for
   * `FOLDER`/`FILE` (both carry `dataRoomId`). Returns `null` when the resource doesn't
   * exist at all.
   *
   * Keyed by `resourceType` so a future batched variant (`resourceIds: string[]` ->
   * `Map<string, string | null>`, using `findMany({ where: { id: { in: ... } } })`) can
   * slot in next to this one without changing `resolveAccess`'s signature — not built
   * now, per AGENTS.md Part 1.
   */
  private async resolveOwnerId(
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<string | null> {
    switch (resourceType) {
      case 'DATA_ROOM': {
        const dataRoom = await this.prisma.dataRoom.findUnique({
          where: { id: resourceId },
          select: { ownerId: true },
        });
        return dataRoom?.ownerId ?? null;
      }
      case 'FOLDER': {
        const folder = await this.prisma.folder.findUnique({
          where: { id: resourceId },
          select: { dataRoom: { select: { ownerId: true } } },
        });
        return folder?.dataRoom.ownerId ?? null;
      }
      case 'FILE': {
        const file = await this.prisma.file.findUnique({
          where: { id: resourceId },
          select: { dataRoom: { select: { ownerId: true } } },
        });
        return file?.dataRoom.ownerId ?? null;
      }
    }
  }
}
