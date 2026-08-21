import { queryClient, tsr } from './api';

/**
 * A folder plus its immediate children — the two requests the folder browser route
 * needs. Kept as two hooks (not one combined one) so each has its own react-query
 * loading/error state, same as `useDataRoomsQuery` does for the room list.
 */
export function useFolderQuery(id: string) {
  return tsr.folders.get.useQuery({
    queryKey: ['folders', id],
    queryData: { params: { id } },
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
