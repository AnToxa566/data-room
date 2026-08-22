import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService, ShareMode } from '@dataroom/database';
import type {
  CreateShareBody,
  CursorPaginationQuery,
  ListSharesQuery,
  Share as ContractShare,
  SharedWithMeItem,
} from '@dataroom/contracts';

import { AccessControlService } from '../access-control/access-control.service.js';
import { decodeCursor, encodeCursor } from '../common/cursor.util.js';
import { isUniqueConstraintViolation } from '../common/prisma-error.util.js';

import { toShareDto } from './share.mapper.js';

const ShareCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});

export interface ListSharesResult {
  items: ContractShare[];
  nextCursor: string | null;
}

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * Share management has no authorization surface of its own — creating, listing, or
   * revoking a share on a resource requires OWNER access to that resource, resolved the
   * same way every other write in this app is. This call alone also produces the correct
   * 404 for a `resourceId` that doesn't exist or isn't the caller's, before any `Share`
   * row is touched.
   *
   * For an `EMAIL`-mode share, `granteeUserId` is resolved *immediately* if the invited
   * address already belongs to a registered `User` — see the `findGranteeUserId` doc
   * comment for why this doesn't reintroduce the unverified-email risk
   * `upsertGoogleUserAndResolvePendingShares` guards against. That login-time resolution
   * still runs and is still required for the "invitee doesn't have an account yet" case
   * — this is an addition, not a replacement. See ARCHITECTURE.md §8's amended
   * "Pending-share resolution" decision-log entry.
   */
  async create(userId: string, body: CreateShareBody): Promise<ContractShare> {
    await this.accessControl.requireAccess(
      userId,
      body.resourceType,
      body.resourceId,
      'OWNER',
    );

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    try {
      const share = await this.prisma.share.create({
        data:
          body.mode === 'public'
            ? {
                resourceType: body.resourceType,
                resourceId: body.resourceId,
                role: body.role,
                mode: ShareMode.PUBLIC,
                expiresAt,
                createdById: userId,
              }
            : {
                resourceType: body.resourceType,
                resourceId: body.resourceId,
                role: body.role,
                mode: ShareMode.EMAIL,
                // Lower-cased so it matches AuthService's case-insensitive lookup
                // regardless of how it's typed here — see auth.service.ts.
                granteeEmail: body.granteeEmail.toLowerCase(),
                granteeUserId: await this.findGranteeUserId(body.granteeEmail),
                expiresAt,
                createdById: userId,
              },
      });
      return toShareDto(share);
    } catch (error) {
      // Defensive — nothing on Share is @unique today, but every write in this codebase
      // catches and translates this the same way in case that ever changes.
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('This share already exists.');
      }
      throw error;
    }
  }

  /**
   * If the invited email already belongs to a registered `User`, resolve `granteeUserId`
   * right away instead of leaving the grantee stuck until their next Google login.
   *
   * This is safe despite ARCHITECTURE.md §4's "never trust an unverified email" rule:
   * a `User` row only ever exists because that exact email already cleared Google's
   * `emailVerified` check at some past login (`AuthService.upsertGoogleUserAndResolvePendingShares`).
   * We're not trusting the *owner's* typed address here — we're matching it against an
   * account whose ownership of that address Google already vouched for. If no such
   * account exists yet, this returns `undefined` and resolution falls back to the
   * existing login-time path once the invitee actually signs up.
   */
  private async findGranteeUserId(granteeEmail: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { email: granteeEmail.toLowerCase() },
      select: { id: true },
    });
    return user?.id;
  }

  /**
   * Every share ever created on this exact `(resourceType, resourceId)` — not inherited
   * from ancestors, this is "who has access to *this* resource specifically", for a
   * management UI. Includes revoked shares so the UI can show "revoked at ..." rather
   * than hide them, per ARCHITECTURE.md's decision log on soft revocation.
   */
  async list(userId: string, query: ListSharesQuery): Promise<ListSharesResult> {
    await this.accessControl.requireAccess(
      userId,
      query.resourceType,
      query.resourceId,
      'OWNER',
    );

    const cursor = query.cursor ? decodeCursor(query.cursor, ShareCursorSchema) : null;

    const shares = await this.prisma.share.findMany({
      where: {
        resourceType: query.resourceType,
        resourceId: query.resourceId,
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

    const hasMore = shares.length > query.limit;
    const page = hasMore ? shares.slice(0, query.limit) : shares;
    const last = page.at(-1);

    return {
      items: page.map(toShareDto),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /**
   * Soft revoke — sets `revokedAt` rather than deleting, so access history stays
   * auditable (ARCHITECTURE.md's decision log). Authorization is the same
   * `requireAccess(..., 'OWNER')` check as `create`/`list`, applied to the share's
   * underlying resource: a caller with no access to that resource gets `404` (can't
   * prove the share exists), one with some access below `OWNER` gets `403` (they already
   * know the resource exists) — the same 404-vs-403 rule as everywhere else in this app,
   * nothing special-cased for shares.
   */
  async revoke(userId: string, id: string): Promise<ContractShare> {
    const share = await this.findOrThrow(id);
    await this.accessControl.requireAccess(
      userId,
      share.resourceType,
      share.resourceId,
      'OWNER',
    );

    const revoked = await this.prisma.share.update({
      where: { id },
      data: { revokedAt: share.revokedAt ?? new Date() },
    });
    return toShareDto(revoked);
  }

  /**
   * Data Rooms, folders, and files shared *directly* with `userId` — active `EMAIL`-mode
   * shares naming them as `granteeUserId`, across all three resource types. This is the
   * "Shared with me" sidebar section and Home page table: deliberately just the direct
   * grants (an entry point), not the full ancestor-inheritance closure that applies once
   * a resource is actually opened (`AccessControlService.resolveAccess`).
   *
   * Two things filtered out silently rather than erroring:
   * - A share whose resource no longer exists — `Share.resourceId` isn't an FK, so
   *   deleting a Data Room/folder/file doesn't clean up shares that targeted it.
   * - A share on a resource `userId` already owns (e.g. shared to themselves by
   *   mistake) — not a meaningful "shared with me" entry.
   *
   * Pagination walks the underlying `Share` rows (same cursor shape as `list`), so a
   * page can come back with fewer than `limit` items when some are filtered out above —
   * accepted as a minor tradeoff rather than adding a second round-trip to top pages up.
   */
  async listSharedWithMe(
    userId: string,
    query: CursorPaginationQuery,
  ): Promise<{ items: SharedWithMeItem[]; nextCursor: string | null }> {
    const cursor = query.cursor ? decodeCursor(query.cursor, ShareCursorSchema) : null;

    const shares = await this.prisma.share.findMany({
      where: {
        granteeUserId: userId,
        mode: ShareMode.EMAIL,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: new Date(cursor.createdAt) } },
                    {
                      AND: [
                        { createdAt: new Date(cursor.createdAt) },
                        { id: { lt: cursor.id } },
                      ],
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { createdBy: { select: { email: true } } },
    });

    const hasMore = shares.length > query.limit;
    const page = hasMore ? shares.slice(0, query.limit) : shares;
    const last = page.at(-1);

    const dataRoomIds = new Set<string>();
    const folderIds = new Set<string>();
    const fileIds = new Set<string>();
    for (const share of page) {
      if (share.resourceType === 'DATA_ROOM') dataRoomIds.add(share.resourceId);
      else if (share.resourceType === 'FOLDER') folderIds.add(share.resourceId);
      else fileIds.add(share.resourceId);
    }

    const [folders, files] = await Promise.all([
      folderIds.size
        ? this.prisma.folder.findMany({
            where: { id: { in: [...folderIds] } },
            select: { id: true, name: true, dataRoomId: true },
          })
        : Promise.resolve([]),
      fileIds.size
        ? this.prisma.file.findMany({
            where: { id: { in: [...fileIds] } },
            select: { id: true, name: true, dataRoomId: true },
          })
        : Promise.resolve([]),
    ]);
    const folderById = new Map(folders.map((f) => [f.id, f]));
    const fileById = new Map(files.map((f) => [f.id, f]));

    // Every Data Room referenced either directly (DATA_ROOM shares) or transitively
    // (FOLDER/FILE shares, via their own dataRoomId) — one query covers the owner check
    // for all three resource types plus name/rootFolderId for DATA_ROOM items.
    for (const folder of folders) dataRoomIds.add(folder.dataRoomId);
    for (const file of files) dataRoomIds.add(file.dataRoomId);
    const dataRooms = dataRoomIds.size
      ? await this.prisma.dataRoom.findMany({
          where: { id: { in: [...dataRoomIds] } },
          select: { id: true, name: true, ownerId: true, rootFolderId: true },
        })
      : [];
    const dataRoomById = new Map(dataRooms.map((r) => [r.id, r]));

    const items: SharedWithMeItem[] = [];
    for (const share of page) {
      if (share.resourceType === 'DATA_ROOM') {
        const room = dataRoomById.get(share.resourceId);
        if (!room || room.ownerId === userId) continue;
        items.push({
          resourceType: 'DATA_ROOM',
          resourceId: share.resourceId,
          name: room.name,
          role: share.role,
          sharedByEmail: share.createdBy.email,
          folderId: room.rootFolderId,
        });
      } else if (share.resourceType === 'FOLDER') {
        const folder = folderById.get(share.resourceId);
        const room = folder ? dataRoomById.get(folder.dataRoomId) : undefined;
        if (!folder || !room || room.ownerId === userId) continue;
        items.push({
          resourceType: 'FOLDER',
          resourceId: share.resourceId,
          name: folder.name,
          role: share.role,
          sharedByEmail: share.createdBy.email,
          folderId: folder.id,
        });
      } else {
        const file = fileById.get(share.resourceId);
        const room = file ? dataRoomById.get(file.dataRoomId) : undefined;
        if (!file || !room || room.ownerId === userId) continue;
        items.push({
          resourceType: 'FILE',
          resourceId: share.resourceId,
          name: file.name,
          role: share.role,
          sharedByEmail: share.createdBy.email,
          folderId: null,
        });
      }
    }

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  private async findOrThrow(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    if (!share) {
      throw new NotFoundException('Share not found.');
    }
    return share;
  }
}
