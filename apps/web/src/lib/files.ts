import { tsr } from './api';

/**
 * A file's own metadata — `routes/file-route.tsx` is the only caller today. Same
 * one-hook-per-request shape as `useFolderQuery` in `lib/folders.ts`.
 */
export function useFileQuery(id: string) {
  return tsr.files.get.useQuery({
    queryKey: ['files', id],
    queryData: { params: { id } },
  });
}

/**
 * A short-lived, inline-disposition signed GCS URL — fed straight into an `<iframe>` by
 * `FileViewerDocument` for the browser's own native PDF rendering (no `pdfjs`/`react-pdf`;
 * see `ARCHITECTURE.md` §9). `enabled` must be gated on `file.status === 'READY'` by the
 * caller: the endpoint 400s on a still-`PENDING` file (see `FilesService.downloadUrl`).
 */
export function useFileDownloadUrlQuery(id: string, options: { enabled: boolean }) {
  return tsr.files.downloadUrl.useQuery({
    queryKey: ['files', id, 'download-url'],
    queryData: { params: { id } },
    enabled: options.enabled,
  });
}

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
