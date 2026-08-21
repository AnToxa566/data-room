import { useEffect, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { FolderChildItem } from '@dataroom/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  useToast,
} from '@dataroom/ui';

import { formatBytes } from '../lib/format-bytes';
import { useDeleteFolderMutation, useFolderStatsQuery } from '../lib/folders';
import { errorMessage } from '../lib/error-message';

interface DeleteFolderDialogProps {
  folder: Extract<FolderChildItem, { kind: 'folder' }> | null;
  /** The folder's parent — needed to invalidate the right children list. */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Delete" modal for a folder row, opened from its quick actions in
 * `FolderChildrenTable`. Deletes the folder's entire subtree (cascades server-side, see
 * `FoldersService.delete`), so this shows the same "Irreversible" destructive treatment
 * as `DeleteDataRoomDialog`. Unlike that dialog it does **not** gate the button behind
 * typing the folder's name — the design reserves that heavier confirmation for deleting
 * a whole Data Room, not one of its folders — and it *does* show a live stats block
 * (files/folders/size about to be deleted), sourced from `GET /folders/:id/stats`, which
 * `DeleteDataRoomDialog` had to drop for lack of an equivalent Data Room endpoint.
 */
export function DeleteFolderDialog({ folder, parentId, open, onOpenChange }: DeleteFolderDialogProps) {
  const stats = useFolderStatsQuery(folder?.id ?? '', { enabled: open && !!folder });
  const mutation = useDeleteFolderMutation(parentId);
  const { toast } = useToast();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel,
  // the close button, Escape, or an overlay click.
  useEffect(() => {
    if (!open) {
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // `folderCount` from the stats endpoint counts the target folder's own row too (its
  // `path` prefix-matches itself — see `FoldersService.stats`), so subtract one to get
  // the number of *subfolders* actually being deleted alongside it.
  const subfolderCount = stats.isSuccess ? stats.data.body.folderCount - 1 : null;
  const itemCount = stats.isSuccess ? stats.data.body.fileCount + (subfolderCount ?? 0) : null;
  // `null` while there's nothing to show yet — the row itself decides whether that means
  // "still loading" (a skeleton) or "give up, we don't know" (an em dash on error).
  const statRows: { label: string; value: number | string | null }[] = [
    { label: 'Files deleted', value: stats.isSuccess ? stats.data.body.fileCount : null },
    { label: 'Subfolders deleted', value: subfolderCount },
    {
      label: 'Total size',
      value: stats.isSuccess ? formatBytes(stats.data.body.totalSize) : null,
    },
  ];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!folder || mutation.isPending || stats.isPending) return;
    mutation.mutate(
      { params: { id: folder.id }, body: undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(`"${folder.name}" deleted permanently`, 'danger');
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return; // don't let an in-flight delete be abandoned
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="border-t-6 border-t-destructive"
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-destructive uppercase">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Irreversible
            </span>
            <DialogTitle>Delete &quot;{folder?.name}&quot; and everything inside it?</DialogTitle>
          </DialogHeader>

          <div className="grid grid-rows-3 gap-2 border-y-2 border-border py-3 text-sm">
            {statRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {row.label}
                </div>
                <div className="font-heading font-extrabold tabular-nums">
                  {row.value !== null ? (
                    row.value
                  ) : stats.isPending ? (
                    <Skeleton className="h-3.5 w-10" />
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This cannot be undone, and any share pointing at this folder stops working immediately.
          </p>

          {mutation.isError && (
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {errorMessage(mutation.error)}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Keep folder
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!folder || mutation.isPending || stats.isPending}
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {mutation.isPending
                ? 'Deleting…'
                : itemCount !== null
                  ? `Delete folder and ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
                  : 'Delete folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
