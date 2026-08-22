import { useState } from 'react';
import { ArrowLeft, Download, Lock, MoreVertical, Move, Pencil, Share2, Trash2 } from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';

import type { SharedFileRootType } from '@dataroom/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dataroom/ui';

import { formatBytes } from '../lib/format-bytes';
import { useDownloadFile } from '../lib/files';

import { DeleteFileDialog } from './delete-file-dialog';
import { MoveFileDialog } from './move-file-dialog';
import { ReadOnlyBadge } from './read-only-badge';
import { RenameFileDialog } from './rename-file-dialog';
import { RevokeShareDialog, type RevokeShareTarget } from './revoke-share-dialog';
import { ShareDialog, type ShareTarget } from './share-dialog';

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface FileViewerHeaderProps {
  fileId: string;
  fileName: string;
  /** Raw byte count as a string — same wire shape as `File.size`; formatted here with
   * `formatBytes`, same as every other size cell in the app. */
  size: string;
  createdAt: string;
  /** Whether the current caller owns this Data Room — `file.data.body.isOwner`. Gates
   * Share and the Rename/Move/Delete kebab items; Download stays available either way
   * (viewing/downloading is the point of a read-only share). */
  isOwner: boolean;
  /** Whether the current caller is signed in — controls the inline read-only badge
   * (signed-in only; a signed-out visitor gets it from `Header` instead). Irrelevant
   * when `isOwner`. */
  signedIn: boolean;
  /** Who shared this file — `file.data.body.sharedByEmail`. Null when `isOwner`. */
  sharedByEmail: string | null;
  /** The caller's virtual root's type — `file.data.body.sharedRootType`. Null when
   * `isOwner`. `'FILE'` means the share is on this file directly, so its containing
   * folder was never fetched (see `routes/file-route.tsx`) — a "Shared file · read-only"
   * pill replaces the Back button in that case. `'FOLDER'`/`'DATA_ROOM'` mean the file
   * was reached by browsing an accessible ancestor, so `folderId`/`backLabel` are set
   * and a normal Back button renders. */
  sharedRootType: SharedFileRootType | null;
  /** The containing folder — `Back` returns here, and it's where a rename/move
   * invalidates and where a Cancel-free "Move" dialog starts browsing from. Undefined
   * exactly when `!isOwner && sharedRootType === 'FILE'` (see above) — never
   * dereferenced in that branch. */
  folderId?: string;
  /** The room name if the containing folder is root, its own name otherwise — same rule
   * `folder-route.tsx` uses for `displayName`. Undefined alongside `folderId`. */
  backLabel?: string;
}

/**
 * The file viewer's top bar (the design's `isFileView` header): a Back button to the
 * containing folder/room (owner, or a recipient who browsed here from a shared folder),
 * the file name + a "size · uploaded" stats line, and the Download/Share/kebab actions.
 * Rename/Move/Delete each open their own modal — same three dialogs `FolderChildrenTable`
 * uses, just with one file instead of a per-row target — and Download fires
 * `useDownloadFile()` directly, same as the table's own Download item. "Share" opens
 * `ShareDialog` targeting this file — the one place among the five triggers that doesn't
 * need an `isRoot` branch, since a file is never a Data Room's root.
 *
 * For a non-owner (share recipient), Share/Rename/Move/Delete are hidden — read-only
 * means read-only. When the share is on this file directly (`sharedRootType === 'FILE'`),
 * there's also no accessible containing folder to go "back" to, so a
 * "Shared file · read-only" pill (the design's `fileSharedBadge`) takes the Back button's
 * place instead.
 */
export function FileViewerHeader({
  fileId,
  fileName,
  size,
  createdAt,
  isOwner,
  signedIn,
  sharedByEmail,
  sharedRootType,
  folderId,
  backLabel,
}: FileViewerHeaderProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeShareTarget | null>(null);
  const downloadFile = useDownloadFile();
  const navigate = useNavigate();

  function handleShare() {
    setShareTarget({
      resourceType: 'FILE',
      resourceId: fileId,
      title: fileName,
      url: `${window.location.origin}/files/${fileId}`,
      fileSize: size,
    });
  }

  const isFileShareRoot = !isOwner && sharedRootType === 'FILE';

  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-border bg-background px-4 py-2.5">
      {isFileShareRoot ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 border border-border px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Shared file · read-only
        </span>
      ) : (
        folderId && (
          <Button variant="outline" asChild>
            <Link to="/folders/$id" params={{ id: folderId }}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {backLabel}
            </Link>
          </Button>
        )
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate font-heading text-sm font-extrabold text-foreground">
          {fileName}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatBytes(size)} · Uploaded {dateFormatter.format(new Date(createdAt))}
        </div>
      </div>

      {!isOwner && signedIn && sharedByEmail && (
        <ReadOnlyBadge sharedByEmail={sharedByEmail} className="hidden min-[900px]:inline-flex" />
      )}

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Download"
          onClick={() => downloadFile({ id: fileId, name: fileName })}
        >
          <Download className="size-4" aria-hidden="true" />
        </Button>
        {isOwner && (
          <>
            <Button type="button" variant="default" onClick={handleShare}>
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="More actions">
                  <MoreVertical className="size-4.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil aria-hidden="true" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                  <Move aria-hidden="true" />
                  Move
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {isOwner && folderId && (
        <>
          <RenameFileDialog
            file={{ id: fileId, name: fileName }}
            parentId={folderId}
            open={renameOpen}
            onOpenChange={setRenameOpen}
          />
          <MoveFileDialog
            file={{ id: fileId, name: fileName, folderId }}
            parentId={folderId}
            open={moveOpen}
            onOpenChange={setMoveOpen}
          />
          <DeleteFileDialog
            file={{ id: fileId, name: fileName, size }}
            parentId={folderId}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => void navigate({ to: '/folders/$id', params: { id: folderId } })}
          />
        </>
      )}
      <ShareDialog
        target={shareTarget}
        open={!!shareTarget}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
        onRequestRevoke={setRevokeTarget}
      />
      <RevokeShareDialog
        target={revokeTarget}
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      />
    </div>
  );
}
