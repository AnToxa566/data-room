import { queryClient, tsr } from './api';

/** Shared by every consumer of "my Data Rooms" — the sidebar nav and the Home table both
 * call this, and react-query dedupes identical `queryKey`s into one request. */
export const DATA_ROOMS_LIST_QUERY_KEY = ['data-rooms', 'list'];

/**
 * First page only (`limit` defaults to 50 server-side) — no infinite scroll/"load more"
 * in this iteration. See ARCHITECTURE.md §7: pagination is cursor-based everywhere, but
 * nothing here needs a second page yet.
 */
export function useDataRoomsQuery() {
  return tsr.dataRooms.list.useQuery({
    queryKey: DATA_ROOMS_LIST_QUERY_KEY,
  });
}

/**
 * `onSuccess` invalidates the list query so both the sidebar nav and the Home table pick
 * up the new room — same `invalidateQueries` pattern as `useSignOut` in `lib/auth.ts`. The
 * caller (`CreateDataRoomDialog`) adds its own `onSuccess` via `mutate()`'s second argument
 * to close the dialog; react-query fires both.
 */
export function useCreateDataRoomMutation() {
  return tsr.dataRooms.create.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DATA_ROOMS_LIST_QUERY_KEY });
    },
  });
}
