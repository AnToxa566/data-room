import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { DataRoomListItem } from '@dataroom/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from '@dataroom/ui';

import { useDeleteDataRoomMutation } from '../lib/data-rooms';
import { errorMessage } from '../lib/error-message';

interface DeleteDataRoomDialogProps {
  room: DataRoomListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Delete" modal for a Data Room, opened from its row's quick actions in
 * `HomeDataRoomsTable`. Deleting a Data Room is irreversible and takes every folder
 * and file inside it with it (`DataRoomsService.delete` cascades via FK constraints,
 * then sweeps storage by prefix — see ARCHITECTURE.md §4/§5), so this gates the Delete
 * button behind typing the room's exact name, matching the design. The design's stats
 * block (files/folders/size deleted) is intentionally dropped — `DataRoomListItem`
 * carries none of that data.
 */
export function DeleteDataRoomDialog({ room, open, onOpenChange }: DeleteDataRoomDialogProps) {
  const [confirmValue, setConfirmValue] = useState('');
  const mutation = useDeleteDataRoomMutation();
  const { toast } = useToast();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel,
  // the close button, Escape, or an overlay click.
  useEffect(() => {
    if (!open) {
      setConfirmValue('');
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = !!room && confirmValue.trim() === room.name;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!room || !ready || mutation.isPending) return;
    mutation.mutate(
      { params: { id: room.id }, body: undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(`Data Room "${room.name}" deleted permanently`, 'danger');
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
            <DialogTitle>Delete the Data Room “{room?.name}”?</DialogTitle>
          </DialogHeader>

          <p className="border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This cannot be undone. Every folder and file inside is deleted permanently, and
            any share pointing at this Data Room stops working immediately.
          </p>

          <div className="grid gap-1.5">
            <label htmlFor="delete-data-room-confirm" className="text-sm font-medium text-foreground">
              Type the room name to confirm
            </label>
            <Input
              id="delete-data-room-confirm"
              autoFocus
              value={confirmValue}
              onChange={(event) => setConfirmValue(event.target.value)}
              placeholder={room?.name}
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
            <Button type="submit" variant="destructive" disabled={!ready || mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Deleting…' : 'Delete Data Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
