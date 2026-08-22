import { useEffect, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { Share, ShareResourceType } from '@dataroom/contracts';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, useToast } from '@dataroom/ui';

import { useRevokeShareMutation } from '../lib/shares';
import { errorMessage } from '../lib/error-message';

export interface RevokeShareTarget {
  /** The share row being revoked — `share.mode` (`'PUBLIC'` | `'EMAIL'`) picks the copy. */
  share: Share;
  resourceType: ShareResourceType;
  resourceId: string;
  /** The shared resource's display name — used in the confirmation sentence. */
  scopeName: string;
}

interface RevokeShareDialogProps {
  target: RevokeShareTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The confirmation modal for `DELETE /shares/:id` — reused for both revoke kinds
 * `ShareDialog` can trigger: turning off public access, and revoking one person's grant.
 * Same guard/disable/spinner/inline-error shape as `DeleteFolderDialog`, and the same
 * colored top border for the same visual weight, but skips that dialog's "Irreversible"
 * eyebrow — revoking isn't literally irreversible (access can be re-granted; a public
 * share can be turned back on at the exact same URL, since this app's links carry no
 * token — see ARCHITECTURE.md §8's "Public-link identity" decision), so that word would
 * overstate it.
 */
export function RevokeShareDialog({ target, open, onOpenChange }: RevokeShareDialogProps) {
  const mutation = useRevokeShareMutation(
    target?.resourceType ?? 'FILE',
    target?.resourceId ?? '',
  );
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

  const isPublic = target?.share.mode === 'PUBLIC';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!target || mutation.isPending) return;
    mutation.mutate(
      { params: { id: target.share.id }, body: undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(
            isPublic
              ? 'Public access turned off'
              : `Access revoked for ${target.share.granteeEmail}`,
            'danger',
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return; // don't let an in-flight revoke be abandoned
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
            <DialogTitle>
              {isPublic ? 'Turn off public access?' : 'Revoke access for this person?'}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-foreground/85">
            {isPublic ? (
              <>
                Anyone who already has the link — including people you did not invite —
                loses access to <span className="font-heading font-extrabold text-foreground">{target?.scopeName}</span>{' '}
                immediately. You can make it public again later at the same link.
              </>
            ) : (
              <>
                <span className="font-heading font-extrabold text-foreground">{target?.share.granteeEmail}</span>{' '}
                loses access to{' '}
                <span className="font-heading font-extrabold text-foreground">{target?.scopeName}</span>{' '}
                and everything inside it immediately.
              </>
            )}
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
              Keep access
            </Button>
            <Button type="submit" variant="destructive" disabled={!target || mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {mutation.isPending
                ? 'Revoking…'
                : isPublic
                  ? 'Turn off public access'
                  : 'Revoke access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
