import { useToast } from '@dataroom/ui';

import { apiClient, queryClient, tsr } from './api';
import { errorMessage } from './error-message';

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
 * documented as both in `ARCHITECTURE.md` §5. `lib/upload-manager.tsx` calls this with no
 * `parentId` (cancelling a still-`PENDING` tray item never changes a cached listing — a
 * `PENDING` file is excluded from every one, see
 * `apps/api/src/files/pending-sweep.service.ts`). `DeleteFileDialog` passes the file's
 * containing folder so the row actually disappears from `FolderChildrenTable`.
 */
export function useDeleteFileMutation(parentId?: string) {
  return tsr.files.delete.useMutation({
    onSuccess: () => {
      if (parentId) {
        void queryClient.invalidateQueries({ queryKey: ['folders', parentId, 'children'] });
      }
    },
  });
}

/**
 * Renames a file — `PATCH /files/:id` with just `{ name }`. Same endpoint as
 * `useMoveFileMutation` below (the contract's `update` handles both), split into its own
 * hook because the two mutations invalidate differently: a rename only ever touches the
 * file's own folder, a move touches two.
 */
export function useRenameFileMutation(parentId: string) {
  return tsr.files.update.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['folders', parentId, 'children'] });
      void queryClient.invalidateQueries({ queryKey: ['files', variables.params.id] });
    },
  });
}

/**
 * Moves a file — `PATCH /files/:id` with `{ folderId }`. `fromFolderId` is the file's
 * folder *at the time the dialog opened* (passed in by the caller, same reasoning as
 * `useUpdateFolderMutation`'s `parentId`); the destination comes out of the mutation
 * variables themselves, so both the old and new folder's children lists get invalidated —
 * a move changes two listings, unlike a rename which only changes one.
 */
export function useMoveFileMutation(fromFolderId: string) {
  return tsr.files.update.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['folders', fromFolderId, 'children'] });
      if (variables.body?.folderId) {
        void queryClient.invalidateQueries({
          queryKey: ['folders', variables.body.folderId, 'children'],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['files', variables.params.id] });
    },
  });
}

/**
 * Downloads a file: fetches a short-lived signed URL and opens it directly, rather than
 * fetching it as a `blob` first — a direct navigation works regardless of whether the GCS
 * bucket's CORS config allows a cross-origin `fetch`, which a blob-download workaround
 * would require. Shared by `FolderChildrenTable`'s row menu and `FileViewerHeader`'s
 * toolbar button — both just need "trigger a download and toast", not persistent query
 * state, so this goes through `apiClient` (see `lib/api.ts`) instead of a query hook.
 */
export function useDownloadFile() {
  const { toast } = useToast();

  return async function downloadFile(file: { id: string; name: string }) {
    try {
      const result = await apiClient.files.downloadUrl({ params: { id: file.id } });
      if (result.status !== 200) throw result;
      window.open(result.body.url, '_blank');
      toast(`Downloading "${file.name}"`);
    } catch (error) {
      toast(errorMessage(error), 'danger');
    }
  };
}
