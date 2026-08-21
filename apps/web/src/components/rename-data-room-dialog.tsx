import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { DataRoomListItem } from '@dataroom/contracts';
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

import { useUpdateDataRoomMutation } from '../lib/data-rooms';
import { errorMessage } from '../lib/error-message';

interface RenameDataRoomDialogProps {
  room: DataRoomListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Rename" modal for a Data Room, opened from its row's quick actions in
 * `HomeDataRoomsTable`. One controlled instance serves every row — see that file for
 * how `room` is set. Structurally mirrors `CreateDataRoomDialog`: controlled
 * `open`/`onOpenChange`, local form state reset on close, submit guarded on
 * `mutation.isPending`, close blocked while in flight, inline error rendering.
 *
 * Unlike folder/file renames, a Data Room has no name-uniqueness constraint at all
 * (`libs/database/prisma/schema.prisma`'s `DataRoom` model has no `@@unique` on
 * `name`) — so there's no client-side conflict check to do here, only required/trimmed
 * validation plus whatever the server happens to reject.
 */
export function RenameDataRoomDialog({ room, open, onOpenChange }: RenameDataRoomDialogProps) {
  const [name, setName] = useState('');
  const mutation = useUpdateDataRoomMutation();
  const { toast } = useToast();

  // Reset for the next time the dialog opens, whether it closed via success, Cancel,
  // the close button, Escape, or an overlay click — and re-seed from whichever room it
  // opens for next.
  useEffect(() => {
    if (open && room) {
      setName(room.name);
    } else if (!open) {
      setName('');
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open`/`room` should
    // re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room]);

  const trimmed = name.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!room || !trimmed || trimmed === room.name || mutation.isPending) return;
    mutation.mutate(
      { params: { id: room.id }, body: { name: trimmed } },
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
            <DialogTitle>Rename Data Room</DialogTitle>
            <DialogDescription>Choose a new name for this Data Room.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label htmlFor="rename-data-room-name" className="text-sm font-medium text-foreground">
              Data Room name
            </label>
            <Input
              id="rename-data-room-name"
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
            <Button type="submit" disabled={!trimmed || trimmed === room?.name || mutation.isPending}>
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
