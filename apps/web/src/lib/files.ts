import { tsr } from './api';

/**
 * Cancels an in-flight upload, or deletes a `READY` file — `DELETE /files/:id` is
 * documented as both in `ARCHITECTURE.md` §5. `lib/upload-manager.tsx` is the only
 * caller today, and only ever on a still-`PENDING` reservation (cancelling a queued/
 * uploading tray item). No `onSuccess` invalidation: a `PENDING` file is excluded from
 * every listing (see `apps/api/src/files/pending-sweep.service.ts`), so removing one
 * never changes anything a component has cached.
 */
export function useDeleteFileMutation() {
  return tsr.files.delete.useMutation();
}
