import type { Share as ContractShare } from '@dataroom/contracts';
import type { Share as PrismaShare } from '@dataroom/database';

/** The only place a Prisma `Share` becomes a wire response — see `toFolderDto` for the
 * same pattern applied to `Folder`. */
export function toShareDto(share: PrismaShare): ContractShare {
  return {
    id: share.id,
    resourceType: share.resourceType,
    resourceId: share.resourceId,
    role: share.role,
    mode: share.mode,
    granteeEmail: share.granteeEmail,
    granteeUserId: share.granteeUserId,
    createdById: share.createdById,
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    revokedAt: share.revokedAt ? share.revokedAt.toISOString() : null,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
  };
}
