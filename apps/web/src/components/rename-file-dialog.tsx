import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from '@dataroom/ui';

import { useRenameFileMutation } from '../lib/files';
import { errorMessage } from '../lib/error-message';

interface RenameFileDialogProps {
  /** Deliberately narrower than `FolderChildItem`'s file variant or `File` from
   * `useFileQuery` — this dialog is opened from both shapes (`FolderChildrenTable`'s row
   * and `FileViewerHeader`'s fetched file), and only ever needs these two fields. */
  file: { id: string; name: string } | null;
  /** The file's containing folder — needed to invalidate the right children list. */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Rename" modal for a file, opened from `FolderChildrenTable`'s row menu and
 * `FileViewerHeader`'s kebab menu. One controlled instance per caller, parameterized by
 * `file` — same shape as `RenameFolderDialog`, which this mirrors almost verbatim (down to
 * the guard/disable/spinner/inline-error shape). `PATCH /files/:id` name-uniqueness is a DB
 * constraint scoped to the folder (`UNIQUE (folderId, name)`), so, same as
 * `RenameFolderDialog`, there's no client-side pre-check — the inline error just surfaces
 * whatever the server rejects.
 */
export function RenameFileDialog({ file, parentId, open, onOpenChange }: RenameFileDialogProps) {
  const [name, setName] = useState('');
  const mutation = useRenameFileMutation(parentId);
  const { toast } = useToast();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel, the
  // close button, Escape, or an overlay click — and re-seed from whichever file it opens
  // for next.
  useEffect(() => {
    if (open && file) {
      setName(file.name);
    } else if (!open) {
      setName('');
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open`/`file` should
    // re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);

  const trimmed = name.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !trimmed || trimmed === file.name || mutation.isPending) return;
    mutation.mutate(
      { params: { id: file.id }, body: { name: trimmed } },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(`Renamed to "${trimmed}"`);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return; // don't let an in-flight rename be abandoned
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
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>Names must be unique inside the same folder.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label htmlFor="rename-file-name" className="text-sm font-medium text-foreground">
              File name
            </label>
            <Input
              id="rename-file-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={mutation.isPending}
              aria-invalid={mutation.isError}
            />
            {mutation.isError && (
              <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {errorMessage(mutation.error)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trimmed || trimmed === file?.name || mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Saving…' : 'Save name'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
