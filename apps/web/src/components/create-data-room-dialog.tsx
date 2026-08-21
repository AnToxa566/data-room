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

import { useCreateDataRoomMutation } from '../lib/data-rooms';

interface CreateDataRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The ts-rest client throws the raw `{ status, body }` result for any non-2xx response
 * (see lib/api.ts's `isTsRestErrorWithStatus` for the same shape read elsewhere) — `body`
 * is `ErrorSchema` (`{ message, ... }`) on every error status this endpoint declares. */
function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'body' in error &&
    typeof (error as { body?: unknown }).body === 'object' &&
    (error as { body?: { message?: unknown } }).body !== null &&
    typeof (error as { body?: { message?: unknown } }).body?.message === 'string'
  ) {
    return (error as { body: { message: string } }).body.message;
  }
  return 'Something went wrong. Try again.';
}

/**
 * The "New Data Room" modal, opened from both `HomeHeader` and `HomeEmptyState`. Fully
 * controlled by the caller so one dialog instance (and one mutation) serves both CTAs —
 * see routes/home-route.tsx.
 */
export function CreateDataRoomDialog({ open, onOpenChange }: CreateDataRoomDialogProps) {
  const [name, setName] = useState('');
  const mutation = useCreateDataRoomMutation();

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
      { body: { name: trimmed } },
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
            <DialogTitle>New Data Room</DialogTitle>
            <DialogDescription>One room per deal. You can rename it later.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label htmlFor="new-data-room-name" className="text-sm font-medium text-foreground">
              Data Room name
            </label>
            <Input
              id="new-data-room-name"
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
              {mutation.isPending ? 'Creating…' : 'Create Data Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
