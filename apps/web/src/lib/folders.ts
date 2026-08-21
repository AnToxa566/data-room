import { queryClient, tsr } from './api';

/**
 * A folder plus its immediate children — the two requests the folder browser route
 * needs. Kept as two hooks (not one combined one) so each has its own react-query
 * loading/error state, same as `useDataRoomsQuery` does for the room list.
 *
 * `options.enabled` exists for `routes/file-route.tsx`: it needs the containing folder's
 * `breadcrumbs`/`isRoot`/`name` for the back-button label, but doesn't know the folder id
 * until its own file query resolves — same "gate on a value from an earlier query"
 * reasoning as `useFolderStatsQuery` below.
 */
export function useFolderQuery(id: string, options?: { enabled?: boolean }) {
  return tsr.folders.get.useQuery({
    queryKey: ['folders', id],
    queryData: { params: { id } },
    enabled: options?.enabled,
  });
}

/**
 * First page only (`limit` defaults to 50 server-side) — same "no infinite scroll yet"
 * scope as `useDataRoomsQuery`.
 */
export function useFolderChildrenQuery(id: string) {
  return tsr.folders.children.useQuery({
    queryKey: ['folders', id, 'children'],
    queryData: { params: { id } },
  });
}

/**
 * Invalidates only the created folder's parent's children list — same targeted
 * `invalidateQueries` shape as `useCreateDataRoomMutation` in `lib/data-rooms.ts`. Not
 * `['folders', parentId]` (the parent's own metadata) — creating a child doesn't change
 * the parent folder's own fields, only what's inside it. The caller (`CreateFolderDialog`)
 * adds its own `onSuccess` via `mutate()`'s second argument to close the dialog.
 */
export function useCreateFolderMutation() {
  return tsr.folders.create.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['folders', variables.body.parentId, 'children'],
      });
    },
  });
}

/**
 * Aggregate size/file count/folder count over a folder's subtree — used by
 * `DeleteFolderDialog` for its "Files deleted / Subfolders deleted / Total size" stats.
 * `enabled` is threaded through so the dialog only fetches while it's actually open.
 */
export function useFolderStatsQuery(id: string, options?: { enabled?: boolean }) {
  return tsr.folders.stats.useQuery({
    queryKey: ['folders', id, 'stats'],
    queryData: { params: { id } },
    enabled: options?.enabled,
  });
}

/**
 * `update`'s body only carries `{ name }` — unlike `create`, there's no `parentId` in the
 * mutation variables to invalidate against, so the caller (`RenameFolderDialog`, which
 * already receives `parentId` as a prop, same as `CreateFolderDialog`) passes it in here.
 * Invalidates both the parent's children list (the row's name changed) and the folder's
 * own cached metadata, if any.
 */
export function useUpdateFolderMutation(parentId: string) {
  return tsr.folders.update.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['folders', parentId, 'children'] });
      void queryClient.invalidateQueries({ queryKey: ['folders', variables.params.id] });
    },
  });
}

/**
 * Same reasoning as `useUpdateFolderMutation` — `delete` has no `parentId` in its
 * variables, so the caller supplies it. Only the parent's children list needs
 * invalidating; the deleted folder's own cache entry, if any, is simply never read again.
 */
export function useDeleteFolderMutation(parentId: string) {
  return tsr.folders.delete.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders', parentId, 'children'] });
    },
  });
}
