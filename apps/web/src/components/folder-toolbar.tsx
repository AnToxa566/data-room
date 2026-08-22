import { useState } from 'react';
import { FolderPlus, Share2, Upload } from 'lucide-react';

import type { Breadcrumb, SharedRootType } from '@dataroom/contracts';
import { Button } from '@dataroom/ui';

import { FolderBreadcrumbs } from './folder-breadcrumbs';
import { ReadOnlyBadge } from './read-only-badge';
import { RevokeShareDialog, type RevokeShareTarget } from './revoke-share-dialog';
import { ShareDialog, type ShareTarget } from './share-dialog';
import { UploadButton } from './upload-button';

interface FolderToolbarProps {
  /** The Data Room's display name — used both as the root segment of the breadcrumb trail
   * and as the page title when the current folder *is* the root. */
  roomName: string;
  /** The current folder's display name — the room name for the root folder, its own `name`
   * otherwise. See `folder-route.tsx`. */
  displayName: string;
  /** `folder.data.body.breadcrumbs` — root-first, current folder last. Passed straight
   * through to `FolderBreadcrumbs`. */
  breadcrumbs: Breadcrumb[];
  /** The current folder — where `UploadButton` uploads into, and what Share targets when
   * this isn't the root (see `isRoot`). */
  folderId: string;
  /** The owning Data Room — what Share targets instead of the folder when `isRoot`. */
  dataRoomId: string;
  /** Whether the current folder is its Data Room's root. A root folder has no meaningful
   * identity of its own to share (it can't be renamed/moved/deleted independently either
   * — see ARCHITECTURE.md §4) — Share targets the Data Room itself instead, same resource,
   * same URL, matching the design's own `scopeLabel` (its synthetic root id renders as
   * `kind: 'Data Room'`, not a folder). */
  isRoot: boolean;
  /** Whether the current caller owns this Data Room — `folder.data.body.isOwner`. Gates
   * every mutation control (New folder/Upload/Share) and the breadcrumb's owner trail;
   * `false` renders the read-only recipient treatment instead. */
  isOwner: boolean;
  /** Whether the current caller is signed in — controls whether the inline read-only
   * badge and the "Shared with me" leading breadcrumb crumb appear (signed-in only; a
   * signed-out visitor gets the badge from `Header` instead, and has no "Shared with me"
   * list to link to). Irrelevant when `isOwner`. */
  signedIn: boolean;
  /** Who shared this resource — `folder.data.body.sharedByEmail`. Null when `isOwner`. */
  sharedByEmail: string | null;
  /** The caller's virtual root's type — `folder.data.body.sharedRootType`. Null when
   * `isOwner`; otherwise selects the "Shared folder"/"Shared Data Room" breadcrumb label. */
  sharedRootType: SharedRootType | null;
  /** Opens `CreateFolderDialog` — see `routes/folder-route.tsx`, which owns its open state. */
  onNewFolder: () => void;
}

/**
 * The breadcrumb + title + action-buttons row atop the folder browser. The breadcrumb trail
 * itself (`Data Rooms > <Room> > … > <Folder>` for the owner, or the scoped recipient trail
 * — see `FolderBreadcrumbs`) is `FolderBreadcrumbs`.
 *
 * "New folder" opens `CreateFolderDialog`. "Upload" opens the native file picker via
 * `UploadButton` — see `lib/upload-manager.tsx`. "Share" opens `ShareDialog`, targeting the
 * Data Room when `isRoot`, the folder otherwise — see `isRoot`'s doc comment. All three are
 * owner-only — a non-owner reaching this route (a share recipient) sees the title and
 * breadcrumb only, plus an inline "Read-only · Shared by X" badge when signed in and wide
 * (see `ReadOnlyBadge`; the narrow/signed-out equivalent lives in `AppTopbar`/`Header`).
 */
export function FolderToolbar({
  roomName,
  displayName,
  breadcrumbs,
  folderId,
  dataRoomId,
  isRoot,
  isOwner,
  signedIn,
  sharedByEmail,
  sharedRootType,
  onNewFolder,
}: FolderToolbarProps) {
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeShareTarget | null>(null);

  function handleShare() {
    const url = `${window.location.origin}/folders/${folderId}`;
    setShareTarget(
      isRoot
        ? {
            resourceType: 'DATA_ROOM',
            resourceId: dataRoomId,
            title: roomName,
            url,
            statsFolderId: folderId,
          }
        : {
            resourceType: 'FOLDER',
            resourceId: folderId,
            title: displayName,
            url,
            statsFolderId: folderId,
          },
    );
  }

  return (
    <>
      <FolderBreadcrumbs
        roomName={roomName}
        breadcrumbs={breadcrumbs}
        rootIsDataRoom={isOwner || sharedRootType === 'DATA_ROOM'}
        scope={
          isOwner
            ? undefined
            : {
                label: sharedRootType === 'DATA_ROOM' ? 'Shared Data Room' : 'Shared folder',
                showSharedWithMeCrumb: signedIn,
              }
        }
      />

      <div className="flex flex-wrap items-end gap-4 border-b-2 border-border pb-3.5">
        <div className="min-w-50 flex-1">
          <h1 className="text-[30px] font-extrabold tracking-tight text-foreground">
            {displayName}
          </h1>
          <div className="mt-0.5 text-xs text-muted-foreground">0 files · 0 folders · 0 B total</div>
        </div>
        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onNewFolder}>
              <FolderPlus className="size-4" aria-hidden="true" />
              New folder
            </Button>
            <UploadButton folderId={folderId} folderName={displayName} variant="outline">
              <Upload className="size-4" aria-hidden="true" />
              Upload
            </UploadButton>
            <Button variant="default" onClick={handleShare}>
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </Button>
          </div>
        ) : (
          signedIn &&
          sharedByEmail && (
            <ReadOnlyBadge sharedByEmail={sharedByEmail} className="hidden min-[900px]:inline-flex" />
          )
        )}
      </div>

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
    </>
  );
}
