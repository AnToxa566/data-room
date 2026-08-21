import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, ShareMode, type ShareResourceType, type ShareRole } from '@dataroom/database';

import { parsePathIds } from '../folders/path.util.js';

import { ACCESS_RANK, type AccessLevel } from './access-control.types.js';

const RESOURCE_LABEL: Record<ShareResourceType, string> = {
  DATA_ROOM: 'Data Room',
  FOLDER: 'Folder',
  FILE: 'File',
};

/** One `{resourceType, resourceId}` pair a `Share` row could target to grant access to a
 * resource — the resource itself, an ancestor folder, or its Data Room. */
interface ShareCandidate {
  resourceType: ShareResourceType;
  resourceId: string;
}

interface ResourceContext {
  ownerId: string;
  shareCandidates: ShareCandidate[];
}

/**
 * The single authorization point for the entire application. Every service and
 * controller routes access decisions through `resolveAccess`/`requireAccess` — no
 * service or controller anywhere may compare `ownerId` directly. Bypassing this once
 * defeats the whole point of the abstraction. See AGENTS.md Part 1.
 *
 * Two ways to get access: owning the Data Room a resource belongs to (`OWNER`), or a
 * `Share` — on the resource itself, any ancestor folder, or the Data Room, strongest role
 * wins (see ARCHITECTURE.md §4). A `Share` in `PUBLIC` mode grants its role to anyone,
 * including a caller with no session at all (`userId: null`) — that's what makes an
 * anonymous public-link visit work. An `EMAIL`-mode share only ever matches
 * `granteeUserId`, never `granteeEmail` — see ARCHITECTURE.md §4's explicit rule; that
 * column is an invitation record `AuthService`'s pending-share resolver reads, not an
 * access key.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves what `userId` can do with `resourceId`. Returns `null` for "doesn't exist",
   * "exists but isn't yours or shared with you", and (for `userId: null`) "no active
   * public share covers it" — collapsing those cases is what lets `requireAccess` return
   * `404` instead of `403` for any of them. A resource a caller can't see must never be
   * distinguishable, over the wire, from a resource that was never there. See
   * ARCHITECTURE.md §7.
   */
  async resolveAccess(
    userId: string | null,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<AccessLevel> {
    const context = await this.resolveResourceContext(resourceType, resourceId);
    if (context === null) {
      return null;
    }
    if (userId !== null && context.ownerId === userId) {
      return 'OWNER';
    }

    return this.resolveShareLevel(userId, context.shareCandidates);
  }

  /**
   * Resolves access and throws the right HTTP error instead of handing back a level for
   * every call site to check by hand.
   *
   * - No access at all -> `404`. The caller can't prove the resource exists, so nothing
   *   is revealed about it — see ARCHITECTURE.md §7. This is also the outcome for a
   *   `null` (anonymous) caller when no public share covers the resource.
   * - Some access, but weaker than `minimum` -> `403`. The caller provably knows the
   *   resource exists (they can already see it at a lower role), so `404` here would
   *   lie — e.g. a `VIEWER` share hitting an `EDITOR`-or-above check.
   *
   * Returns the resolved level so callers that also need it (e.g. to decide what a
   * response includes) don't have to resolve twice.
   */
  async requireAccess(
    userId: string | null,
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
   * Looks up a resource's owner plus every `{resourceType, resourceId}` pair a `Share`
   * could target to grant access to it — the resource itself, its ancestor folders (from
   * the materialized `path`, which already includes the folder's own id — see
   * `parsePathIds`), and its Data Room. One query regardless of resource type or subtree
   * depth, per ARCHITECTURE.md §4's "ancestors come from `path`, so this is a single
   * query". Returns `null` when the resource doesn't exist at all.
   */
  private async resolveResourceContext(
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<ResourceContext | null> {
    switch (resourceType) {
      case 'DATA_ROOM': {
        const dataRoom = await this.prisma.dataRoom.findUnique({
          where: { id: resourceId },
          select: { ownerId: true },
        });
        if (!dataRoom) {
          return null;
        }
        return {
          ownerId: dataRoom.ownerId,
          shareCandidates: [{ resourceType: 'DATA_ROOM', resourceId }],
        };
      }
      case 'FOLDER': {
        const folder = await this.prisma.folder.findUnique({
          where: { id: resourceId },
          select: {
            dataRoomId: true,
            path: true,
            dataRoom: { select: { ownerId: true } },
          },
        });
        if (!folder) {
          return null;
        }
        return {
          ownerId: folder.dataRoom.ownerId,
          shareCandidates: [
            { resourceType: 'DATA_ROOM', resourceId: folder.dataRoomId },
            ...parsePathIds(folder.path).map(
              (id): ShareCandidate => ({ resourceType: 'FOLDER', resourceId: id }),
            ),
          ],
        };
      }
      case 'FILE': {
        const file = await this.prisma.file.findUnique({
          where: { id: resourceId },
          select: {
            dataRoomId: true,
            dataRoom: { select: { ownerId: true } },
            folder: { select: { path: true } },
          },
        });
        if (!file) {
          return null;
        }
        return {
          ownerId: file.dataRoom.ownerId,
          shareCandidates: [
            { resourceType: 'DATA_ROOM', resourceId: file.dataRoomId },
            ...parsePathIds(file.folder.path).map(
              (id): ShareCandidate => ({ resourceType: 'FOLDER', resourceId: id }),
            ),
            { resourceType: 'FILE', resourceId },
          ],
        };
      }
    }
  }

  /**
   * The strongest role an active, non-expired `Share` among `candidates` grants
   * `userId` — never row order (ARCHITECTURE.md §4). A `PUBLIC`-mode share applies to
   * every caller, including `userId: null`. An `EMAIL`-mode share applies only when its
   * resolved `granteeUserId` matches — `granteeEmail` is never read here.
   */
  private async resolveShareLevel(
    userId: string | null,
    candidates: ShareCandidate[],
  ): Promise<ShareRole | null> {
    const shares = await this.prisma.share.findMany({
      where: {
        revokedAt: null,
        OR: candidates,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      select: { role: true, mode: true, granteeUserId: true },
    });

    let best: ShareRole | null = null;
    for (const share of shares) {
      const applies =
        share.mode === ShareMode.PUBLIC ||
        (userId !== null && share.granteeUserId === userId);
      if (!applies) {
        continue;
      }
      if (best === null || ACCESS_RANK[share.role] > ACCESS_RANK[best]) {
        best = share.role;
      }
    }
    return best;
  }
}
