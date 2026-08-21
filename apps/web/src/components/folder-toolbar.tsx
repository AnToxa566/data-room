import { FolderPlus, Share2, Upload } from 'lucide-react';

import { Button } from '@dataroom/ui';

interface FolderToolbarProps {
  /** The Data Room's display name — for the root folder shown here, per `folder-route.tsx`. */
  name: string;
  /** Opens `CreateFolderDialog` — see `routes/folder-route.tsx`, which owns its open state. */
  onNewFolder: () => void;
}

/**
 * The breadcrumb + title + action-buttons row atop the folder browser. Only ever
 * rendered for a root folder in this pass (see `folder-route.tsx`), so the breadcrumb
 * is a single non-interactive "current page" crumb rather than the design's full
 * multi-segment/ellipsis trail — that machinery has nothing to truncate until subfolder
 * navigation exists.
 *
 * "New folder" opens `CreateFolderDialog`. Upload / Share are still inert (no
 * `onClick`) — wiring them is explicitly out of scope for this pass; see the plan doc.
 */
export function FolderToolbar({ name, onNewFolder }: FolderToolbarProps) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex min-h-7 items-center">
        <span
          aria-current="page"
          className="max-w-60 truncate font-heading text-sm font-extrabold text-foreground"
        >
          {name}
        </span>
      </nav>

      <div className="flex flex-wrap items-end gap-4 border-b-2 border-border pb-3.5">
        <div className="min-w-50 flex-1">
          <h1 className="text-[30px] font-extrabold tracking-tight text-foreground">{name}</h1>
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
