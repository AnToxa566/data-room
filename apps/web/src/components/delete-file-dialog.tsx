import { useEffect, type FormEvent } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@dataroom/ui';

import { formatBytes } from '../lib/format-bytes';
import { useDeleteFileMutation } from '../lib/files';
import { errorMessage } from '../lib/error-message';

interface DeleteFileDialogProps {
  file: { id: string; name: string; size: string } | null;
  /** The file's containing folder — needed to invalidate the right children list. */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after the toast/close on a successful delete. Unused by `FolderChildrenTable`
   * (the row just disappears once the children list refetches); `FileViewerHeader` uses
   * it to navigate away from the now-gone `/files/:id` page. */
  onDeleted?: () => void;
}

/**
 * The "Delete" modal for a file, opened from `FolderChildrenTable`'s row menu and
 * `FileViewerHeader`'s kebab menu. Deliberately **lighter** than `DeleteFolderDialog` — the
 * design's `dlgDelFile` has no red top border, no "Irreversible" eyebrow, and no subtree
 * stats block (a file has no subtree; `DeleteFolderDialog`'s heavier treatment is reserved
 * for a cascading folder/Data Room delete). Same guard/disable/spinner/toast shape as every
 * other dialog here otherwise.
 */
export function DeleteFileDialog({
  file,
  parentId,
  open,
  onOpenChange,
  onDeleted,
}: DeleteFileDialogProps) {
  const mutation = useDeleteFileMutation(parentId);
  const { toast } = useToast();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel, the
  // close button, Escape, or an overlay click.
  useEffect(() => {
    if (!open) {
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || mutation.isPending) return;
    mutation.mutate(
      { params: { id: file.id }, body: undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(`"${file.name}" deleted permanently`, 'danger');
          onDeleted?.();
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
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
          </DialogHeader>

          <div className="text-sm text-foreground/85">
            <div className="font-heading text-sm font-extrabold text-foreground">
              {file?.name}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {file ? formatBytes(file.size) : ''} · deleting is permanent
            </div>
          </div>

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
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!file || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Deleting…' : 'Delete file'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
