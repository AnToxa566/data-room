import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react';

import type { ShareResourceType } from '@dataroom/contracts';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  useToast,
} from '@dataroom/ui';

import { formatBytes } from '../lib/format-bytes';
import { useFolderStatsQuery } from '../lib/folders';
import { useCreateShareMutation, useSharesQuery } from '../lib/shares';
import { errorMessage } from '../lib/error-message';

import type { RevokeShareTarget } from './revoke-share-dialog';

export interface ShareTarget {
  resourceType: ShareResourceType;
  resourceId: string;
  /** Dialog heading — the Data Room/folder/file's own name. */
  title: string;
  /** Canonical absolute app URL for this resource — same URL regardless of who's asking
   * or how they got access (owner, grantee, or public visitor). See
   * ARCHITECTURE.md §4/§8's "Public-link identity" decision. Computed by the caller,
   * since it depends on routes this component shouldn't need to know about. */
  url: string;
  /** FOLDER/DATA_ROOM only — the folder whose subtree stats describe "everything nested
   * inside" (the resource's own id for a folder share, the Data Room's root folder id for
   * a Data Room share — both are just `GET /folders/:id/stats` calls). Omit for FILE. */
  statsFolderId?: string;
  /** FILE only — its own size (BigInt-as-string, same wire shape as everywhere else). */
  fileSize?: string;
}

interface ShareDialogProps {
  target: ShareTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens `RevokeShareDialog` for one share — used both for "Turn off public access" and
   * a person's "Revoke" row action. This dialog stays open underneath it. */
  onRequestRevoke: (target: RevokeShareTarget) => void;
}

const KIND_LABEL: Record<ShareResourceType, string> = {
  DATA_ROOM: 'Data Room',
  FOLDER: 'folder',
  FILE: 'file',
};

/**
 * The Share modal — one component for all three resource types, per the design
 * (`Data Red Room.dc.html`'s `dlgShare`). Two sections, toggled by plain buttons rather
 * than a Tabs primitive (the design's own `onTabLink`/`onTabPeople` markup is just two
 * `<button aria-pressed>`s, and `libs/ui` has no Tabs component to reach for otherwise):
 *
 * - **Public access**: a readonly input with the resource's own canonical URL + Copy —
 *   always available, never an API call, works identically whether public access is on
 *   or off (see `ShareTarget.url`'s doc comment). Below it, "Make public" / "Turn off
 *   public access" — **not** "create/revoke a link"; this app's shares carry no token, so
 *   there's nothing to create beyond flipping the `PUBLIC` share's existence. This is a
 *   deliberate deviation from the design's literal "Create public link" copy, called out
 *   in the plan doc.
 * - **People**: invite by email (role is always `VIEWER` — the design's own "Invite as
 *   viewer" button has no role picker, and `EDITOR` isn't enforced yet — see
 *   AGENTS.md), plus the list of everyone with active access, each row's "Revoke" handing
 *   off to `onRequestRevoke`.
 */
export function ShareDialog({ target, open, onOpenChange, onRequestRevoke }: ShareDialogProps) {
  const [tab, setTab] = useState<'public' | 'people'>('public');
  const [inviteEmail, setInviteEmail] = useState('');
  const [justCopied, setJustCopied] = useState(false);
  const { toast } = useToast();

  const resourceType = target?.resourceType ?? 'FILE';
  const resourceId = target?.resourceId ?? '';
  const shares = useSharesQuery(resourceType, resourceId, { enabled: open && !!target });
  const stats = useFolderStatsQuery(target?.statsFolderId ?? '', {
    enabled: open && !!target?.statsFolderId,
  });
  const makePublicMutation = useCreateShareMutation(resourceType, resourceId);
  const inviteMutation = useCreateShareMutation(resourceType, resourceId);

  // Reset for the next time the dialog opens, whether it closed via success, the close
  // button, Escape, or an overlay click.
  useEffect(() => {
    if (!open) {
      setTab('public');
      setInviteEmail('');
      setJustCopied(false);
      makePublicMutation.reset();
      inviteMutation.reset();
    }
    // `makePublicMutation`/`inviteMutation` are fresh objects every render (react-query);
    // only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The list endpoint keeps revoked rows for history (soft-revoke — see
  // ARCHITECTURE.md §8) — this dialog only cares about what's currently active.
  const activeShares = shares.data?.body.items.filter((share) => share.revokedAt === null) ?? [];
  const publicShare = activeShares.find((share) => share.mode === 'PUBLIC') ?? null;
  const people = activeShares.filter((share) => share.mode === 'EMAIL');

  // `folderCount` counts the target folder's own row too (its `path` prefix-matches
  // itself), same as `DeleteFolderDialog` — subtract one for "everything nested inside".
  const subfolderCount = stats.isSuccess ? stats.data.body.folderCount - 1 : null;

  async function handleCopy() {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.url);
      setJustCopied(true);
      toast('Link copied');
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast('Could not copy the link — copy it from the address bar instead', 'danger');
    }
  }

  function handleMakePublic() {
    if (!target || makePublicMutation.isPending) return;
    makePublicMutation.mutate(
      { body: { mode: 'public', resourceType: target.resourceType, resourceId: target.resourceId } },
      { onSuccess: () => toast('Public access turned on') },
    );
  }

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!target || !email.includes('@') || inviteMutation.isPending) return;
    inviteMutation.mutate(
      {
        body: {
          mode: 'email',
          resourceType: target.resourceType,
          resourceId: target.resourceId,
          granteeEmail: email,
        },
      },
      {
        onSuccess: () => {
          setInviteEmail('');
          toast(`Invited ${email}`);
        },
      },
    );
  }

  const isPending = makePublicMutation.isPending || inviteMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return; // don't let an in-flight create be abandoned
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <span className="text-[11px] font-medium tracking-wide text-accent uppercase">
            Share {target ? KIND_LABEL[target.resourceType] : ''}
          </span>
          <DialogTitle className="truncate">{target?.title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 bg-secondary/60 px-3 py-2.5 text-xs text-foreground/85">
          {target?.resourceType === 'FILE' ? (
            <span>
              Recipients get read-only access to this file
              {target.fileSize ? ` (${formatBytes(target.fileSize)})` : ''}. They cannot
              rename, move, or delete it.
            </span>
          ) : (
            <span>
              Recipients get read-only access to everything nested inside
              {stats.isSuccess ? (
                <>
                  {' '}
                  — {stats.data.body.fileCount} {stats.data.body.fileCount === 1 ? 'file' : 'files'} ·{' '}
                  {subfolderCount} {subfolderCount === 1 ? 'folder' : 'folders'} ·{' '}
                  {formatBytes(stats.data.body.totalSize)}
                </>
              ) : null}
              . They cannot upload, rename, move, or delete.
            </span>
          )}
        </div>

        {activeShares.length > 0 && (
          <div className="flex items-center gap-2 border-y border-border py-2 text-xs text-foreground/85">
            <span className="size-1.75 shrink-0 bg-accent" aria-hidden="true" />
            <span>
              Already shared — {publicShare ? 'public access is on' : 'not public'} ·{' '}
              {people.length} {people.length === 1 ? 'person' : 'people'} invited
            </span>
          </div>
        )}

        <div className="flex border border-border">
          <button
            type="button"
            aria-pressed={tab === 'public'}
            onClick={() => setTab('public')}
            className={cn(
              'flex-1 border-r border-border px-3 py-2 font-heading text-[13px] font-extrabold',
              tab === 'public' ? 'bg-foreground text-background' : 'text-foreground/85',
            )}
          >
            Public access
          </button>
          <button
            type="button"
            aria-pressed={tab === 'people'}
            onClick={() => setTab('people')}
            className={cn(
              'flex-1 px-3 py-2 font-heading text-[13px] font-extrabold',
              tab === 'people' ? 'bg-foreground text-background' : 'text-foreground/85',
            )}
          >
            People
          </button>
        </div>

        {tab === 'public' && (
          <div>
            <div className="flex gap-0">
              <Input
                readOnly
                value={target?.url ?? ''}
                aria-label="Resource link"
                className="flex-1 rounded-r-none"
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 rounded-l-none border-l-0"
                onClick={() => void handleCopy()}
              >
                {justCopied ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                Copy
              </Button>
            </div>

            <div className="mt-3.5">
              {shares.isPending ? (
                <Skeleton className="h-8 w-full" />
              ) : publicShare ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 text-[12px] font-heading font-extrabold tracking-wide text-foreground uppercase">
                    <span className="size-1.75 bg-accent" aria-hidden="true" />
                    Public access is on — anyone with the link can view
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      target &&
                      onRequestRevoke({
                        share: publicShare,
                        resourceType: target.resourceType,
                        resourceId: target.resourceId,
                        scopeName: target.title,
                      })
                    }
                  >
                    Turn off public access
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="mb-2.5 text-xs text-muted-foreground">
                    Public access is off. Turning it on lets anyone with the link view this
                    without signing in.
                  </p>
                  <Button type="button" onClick={handleMakePublic} disabled={makePublicMutation.isPending}>
                    {makePublicMutation.isPending && (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    )}
                    {makePublicMutation.isPending ? 'Making public…' : 'Make public'}
                  </Button>
                  {makePublicMutation.isError && (
                    <p role="alert" className="mt-2 flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {errorMessage(makePublicMutation.error)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'people' && (
          <div>
            <form onSubmit={handleInvite} className="flex gap-0">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="name@firm.com"
                aria-label="Invite by email"
                disabled={inviteMutation.isPending}
                className="flex-1 rounded-r-none"
              />
              <Button
                type="submit"
                className="h-9 shrink-0 rounded-l-none border-l-0 border-primary"
                disabled={!inviteEmail.trim().includes('@') || inviteMutation.isPending}
              >
                {inviteMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                Invite as viewer
              </Button>
            </form>
            {inviteMutation.isError && (
              <p role="alert" className="mt-2 flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {errorMessage(inviteMutation.error)}
              </p>
            )}

            <div className="mt-3.5">
              {shares.isPending ? (
                <Skeleton className="h-8 w-full" />
              ) : people.length === 0 ? (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  Nobody has been invited yet. Invited people get read-only access to this
                  item and everything inside it.
                </p>
              ) : (
                <div>
                  <div className="border-b-2 border-border pb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                    {people.length} with access
                  </div>
                  {people.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center gap-2.5 border-b border-border py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-foreground">
                          {share.granteeEmail}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {share.granteeUserId ? 'Active viewer' : 'Invited — not signed in yet'}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          target &&
                          onRequestRevoke({
                            share,
                            resourceType: target.resourceType,
                            resourceId: target.resourceId,
                            scopeName: target.title,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
