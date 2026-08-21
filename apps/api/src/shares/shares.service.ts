import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService, ShareMode } from '@dataroom/database';
import type {
  CreateShareBody,
  ListSharesQuery,
  Share as ContractShare,
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

  private async findOrThrow(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    if (!share) {
      throw new NotFoundException('Share not found.');
    }
    return share;
  }
}
