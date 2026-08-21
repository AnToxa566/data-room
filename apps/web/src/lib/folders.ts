import { tsr } from './api';

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
 * scope as `useDataRoomsQuery`. Every root folder is empty today (there's no
 * upload/create-folder UI), so a second page is never reachable in this iteration.
 */
export function useFolderChildrenQuery(id: string) {
  return tsr.folders.children.useQuery({
    queryKey: ['folders', id, 'children'],
    queryData: { params: { id } },
  });
}
