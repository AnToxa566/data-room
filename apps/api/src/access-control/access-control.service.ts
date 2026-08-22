import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, ShareMode, type ShareResourceType, type ShareRole } from '@dataroom/database';

import { parsePathIds } from '../folders/path.util.js';

import { ACCESS_RANK, type AccessLevel, type ShareContext } from './access-control.types.js';

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
      if (!this.shareApplies(userId, share)) {
        continue;
      }
      if (best === null || ACCESS_RANK[share.role] > ACCESS_RANK[best]) {
        best = share.role;
      }
    }
    return best;
  }

  /**
   * Whether an active `Share` row grants access to `userId` — `PUBLIC` grants to every
   * caller, including `userId: null`; `EMAIL` only when its resolved `granteeUserId`
   * matches (`granteeEmail` is never read as an access key, see ARCHITECTURE.md §4).
   * Extracted so this security-sensitive predicate exists in exactly one place —
   * `resolveShareLevel`'s strongest-role loop and `resolveShareContext`'s boundary walk
   * below both call it, rather than each re-implementing the same check.
   */
  private shareApplies(
    userId: string | null,
    share: { mode: ShareMode; granteeUserId: string | null },
  ): boolean {
    return share.mode === ShareMode.PUBLIC || (userId !== null && share.granteeUserId === userId);
  }

  /**
   * Resolves a non-owner caller's "virtual root" for `resourceId` — which share is the
   * widest match, and who created it — for display purposes (a "Read-only · Shared by
   * X" badge, and breadcrumbs scoped to that root; see ARCHITECTURE.md §4: "the shared
   * resource becomes their virtual root, and breadcrumbs are computed relative to it").
   *
   * Must be called only after the caller's own `requireAccess(...)` has already
   * confirmed access — this method assumes the resource exists and is reachable, and
   * re-resolves `resolveResourceContext` independently rather than threading its result
   * through, at the cost of one extra (cheap, low-traffic) round trip. Used only by
   * `FoldersService.get`/`FilesService.get`, not the hot `resolveAccess`/`requireAccess`
   * path every other endpoint goes through — `resolveAccess`'s own signature is
   * untouched.
   */
  async resolveShareContext(
    userId: string | null,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<ShareContext> {
    const context = await this.resolveResourceContext(resourceType, resourceId);
    if (context === null) {
      // The caller's own requireAccess already confirmed this resource is reachable —
      // reaching here means it was deleted in the moment between that check and this
      // one. A genuine race, not a real 404 for a caller who was just looking at it.
      throw new NotFoundException(`${RESOURCE_LABEL[resourceType]} not found.`);
    }
    if (userId !== null && context.ownerId === userId) {
      return { isOwner: true, sharedByEmail: null, sharedRootType: null, sharedRootId: null };
    }

    const shares = await this.prisma.share.findMany({
      where: {
        revokedAt: null,
        OR: context.shareCandidates,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      select: {
        resourceType: true,
        resourceId: true,
        role: true,
        mode: true,
        granteeUserId: true,
        createdAt: true,
        createdBy: { select: { email: true } },
      },
    });

    // `shareCandidates` is already widest-to-narrowest (DATA_ROOM, then ancestor
    // folders root-first, self-last, then the resource itself if applicable) — the
    // first candidate with >=1 applicable share is this caller's virtual root. A
    // narrower share can still grant a *stronger role* (that's `resolveShareLevel`'s
    // job, unrelated) but never moves the boundary.
    for (const candidate of context.shareCandidates) {
      const applicable = shares.filter(
        (share) =>
          share.resourceType === candidate.resourceType &&
          share.resourceId === candidate.resourceId &&
          this.shareApplies(userId, share),
      );
      if (applicable.length === 0) {
        continue;
      }

      // Multiple shares can apply at the same candidate (e.g. a PUBLIC and an EMAIL
      // share on the same folder) — attribute "shared by" to the strongest-role one,
      // tie-broken by earliest createdAt. Display-only choice, not a security decision.
      let widest = applicable[0];
      for (const share of applicable.slice(1)) {
        if (
          ACCESS_RANK[share.role] > ACCESS_RANK[widest.role] ||
          (ACCESS_RANK[share.role] === ACCESS_RANK[widest.role] &&
            share.createdAt < widest.createdAt)
        ) {
          widest = share;
        }
      }

      return {
        isOwner: false,
        sharedByEmail: widest.createdBy.email,
        sharedRootType: candidate.resourceType,
        sharedRootId: candidate.resourceId,
      };
    }

    // Unreachable given the precondition (the caller's own requireAccess already found
    // something) — defensive only, same reasoning as the null-context throw above.
    throw new NotFoundException(`${RESOURCE_LABEL[resourceType]} not found.`);
  }
}
