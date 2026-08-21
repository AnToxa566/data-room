import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { FolderChildItem } from '@dataroom/contracts';
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

import { useUpdateFolderMutation } from '../lib/folders';
import { errorMessage } from '../lib/error-message';

interface RenameFolderDialogProps {
  folder: Extract<FolderChildItem, { kind: 'folder' }> | null;
  /** The folder's parent — needed to invalidate the right children list. */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Rename" modal for a folder row, opened from its quick actions in
 * `FolderChildrenTable`. One controlled instance serves every row — see that file for
 * how `folder` is set. Structurally mirrors `RenameDataRoomDialog`, the Data Room
 * equivalent, down to the guard/disable/spinner/inline-error shape.
 *
 * Unlike a Data Room, a folder name *is* unique among its siblings (a DB constraint —
 * see ARCHITECTURE.md §4), so the server can 409 here; there's still no client-side
 * pre-check, same as `CreateFolderDialog` — the inline error just surfaces whatever the
 * server rejects.
 */
export function RenameFolderDialog({
  folder,
  parentId,
  open,
  onOpenChange,
}: RenameFolderDialogProps) {
  const [name, setName] = useState('');
  const mutation = useUpdateFolderMutation(parentId);
  const { toast } = useToast();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel,
  // the close button, Escape, or an overlay click — and re-seed from whichever folder it
  // opens for next.
  useEffect(() => {
    if (open && folder) {
      setName(folder.name);
    } else if (!open) {
      setName('');
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open`/`folder`
    // should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder]);

  const trimmed = name.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!folder || !trimmed || trimmed === folder.name || mutation.isPending) return;
    mutation.mutate(
      { params: { id: folder.id }, body: { name: trimmed } },
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
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>Names must be unique inside the same folder.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label htmlFor="rename-folder-name" className="text-sm font-medium text-foreground">
              Folder name
            </label>
            <Input
              id="rename-folder-name"
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
              disabled={!trimmed || trimmed === folder?.name || mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
