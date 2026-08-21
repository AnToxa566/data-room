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
} from '@dataroom/ui';

import { useCreateFolderMutation } from '../lib/folders';
import { errorMessage } from '../lib/error-message';

interface CreateFolderDialogProps {
  parentId: string;
  dataRoomId: string;
  /** The parent folder's display name — for the "Created inside {folderName}." hint. */
  folderName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "New folder" modal, opened from both `FolderToolbar` and `FolderEmptyState`. Fully
 * controlled by the caller so one dialog instance (and one mutation) serves both CTAs —
 * see routes/folder-route.tsx. Structurally mirrors `CreateDataRoomDialog`.
 */
export function CreateFolderDialog({
  parentId,
  dataRoomId,
  folderName,
  open,
  onOpenChange,
}: CreateFolderDialogProps) {
  const [name, setName] = useState('');
  const mutation = useCreateFolderMutation();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel, the
  // close button, Escape, or an overlay click.
  useEffect(() => {
    if (!open) {
      setName('');
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = name.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || mutation.isPending) return;
    mutation.mutate(
      { body: { dataRoomId, parentId, name: trimmed } },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return; // don't let an in-flight create be abandoned
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
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Created inside {folderName}.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label htmlFor="new-folder-name" className="text-sm font-medium text-foreground">
              Folder name
            </label>
            <Input
              id="new-folder-name"
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
            <Button type="submit" disabled={!trimmed || mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Creating…' : 'Create folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
