import { FolderPlus, Share2, Upload } from 'lucide-react';

import type { Breadcrumb } from '@dataroom/contracts';
import { Button } from '@dataroom/ui';

import { FolderBreadcrumbs } from './folder-breadcrumbs';

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
  /** Opens `CreateFolderDialog` — see `routes/folder-route.tsx`, which owns its open state. */
  onNewFolder: () => void;
}

/**
 * The breadcrumb + title + action-buttons row atop the folder browser. The breadcrumb trail
 * itself (`Data Rooms > <Room> > … > <Folder>`, with ellipsis-collapsing past 5 segments) is
 * `FolderBreadcrumbs` — see that file for the collapsing rule.
 *
 * "New folder" opens `CreateFolderDialog`. Upload / Share are still inert (no
 * `onClick`) — wiring them is explicitly out of scope for this pass; see the plan doc.
 */
export function FolderToolbar({
  roomName,
  displayName,
  breadcrumbs,
  onNewFolder,
}: FolderToolbarProps) {
  return (
    <>
      <FolderBreadcrumbs roomName={roomName} breadcrumbs={breadcrumbs} />

      <div className="flex flex-wrap items-end gap-4 border-b-2 border-border pb-3.5">
        <div className="min-w-50 flex-1">
          <h1 className="text-[30px] font-extrabold tracking-tight text-foreground">
            {displayName}
          </h1>
          <div className="mt-0.5 text-xs text-muted-foreground">0 files · 0 folders · 0 B total</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onNewFolder}>
            <FolderPlus className="size-4" aria-hidden="true" />
            New folder
          </Button>
          <Button variant="outline">
            <Upload className="size-4" aria-hidden="true" />
            Upload
          </Button>
          <Button variant="default">
            <Share2 className="size-4" aria-hidden="true" />
            Share
          </Button>
        </div>
      </div>
    </>
  );
}
