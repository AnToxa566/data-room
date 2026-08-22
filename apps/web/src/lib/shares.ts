import type { ShareResourceType } from '@dataroom/contracts';

import { queryClient, tsr } from './api';

/**
 * `['shares', resourceType, resourceId]` — one list per resource, mirroring
 * `ListSharesQuerySchema`'s required query params 1:1. Every mutation below invalidates
 * exactly this key, scoped to the resource the dialog is open for.
 */
function sharesQueryKey(resourceType: ShareResourceType, resourceId: string) {
  return ['shares', resourceType, resourceId];
}

/**
 * Shares on one resource — both `EMAIL` and `PUBLIC`, active *and* revoked (soft-revoke
 * keeps the row; see ARCHITECTURE.md §8's "Revocation" decision). Callers filter
 * `revokedAt === null` themselves to get the currently-active set — this hook doesn't
 * pre-filter, since a UI might reasonably want to show revoked history later.
 */
export function useSharesQuery(
  resourceType: ShareResourceType,
  resourceId: string,
  options?: { enabled?: boolean },
) {
  return tsr.shares.list.useQuery({
    queryKey: sharesQueryKey(resourceType, resourceId),
    queryData: { query: { resourceType, resourceId } },
    enabled: options?.enabled,
  });
}

/**
 * Creates a share on `resourceType`/`resourceId` — either mode. Note
 * `CreateShareBodySchema`'s `mode` discriminator is lowercase (`'public'`/`'email'`),
 * unlike the response `ShareSchema.mode` (`'PUBLIC'`/`'EMAIL'`) read back from
 * `useSharesQuery` — the two do not round-trip as the same string.
 */
export function useCreateShareMutation(resourceType: ShareResourceType, resourceId: string) {
  return tsr.shares.create.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: sharesQueryKey(resourceType, resourceId),
      });
    },
  });
}

/** Revokes (soft-deletes) one share by id — used for both a named grant and a public share. */
export function useRevokeShareMutation(resourceType: ShareResourceType, resourceId: string) {
  return tsr.shares.revoke.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: sharesQueryKey(resourceType, resourceId),
      });
    },
  });
}
