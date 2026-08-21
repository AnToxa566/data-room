import { ArrowLeft, Download, MoreVertical, Move, Pencil, Share2, Trash2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dataroom/ui';

import { formatBytes } from '../lib/format-bytes';

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface FileViewerHeaderProps {
  fileName: string;
  /** Raw byte count as a string — same wire shape as `File.size`; formatted here with
   * `formatBytes`, same as every other size cell in the app. */
  size: string;
  createdAt: string;
  /** The containing folder — `Back` returns here. */
  folderId: string;
  /** The room name if the containing folder is root, its own name otherwise — same rule
   * `folder-route.tsx` uses for `displayName`. */
  backLabel: string;
}

/**
 * The file viewer's top bar (the design's `isFileView` header): a Back button to the
 * containing folder/room, the file name + a "size · uploaded" stats line, and the
 * Download/Share/kebab actions. Every action here is intentionally inert (no `onClick`/
 * `onSelect`) — same "render the control, wire it up later" treatment the file row's own
 * kebab menu already gets in `FolderChildrenTable`. There's no "Shared file · read-only"
 * badge: that's the recipient flow, which doesn't exist anywhere else in this app yet.
 */
export function FileViewerHeader({
  fileName,
  size,
  createdAt,
  folderId,
  backLabel,
}: FileViewerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-border bg-background px-4 py-2.5">
      <Button variant="outline" asChild>
        <Link to="/folders/$id" params={{ id: folderId }}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      </Button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-heading text-sm font-extrabold text-foreground">
          {fileName}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatBytes(size)} · Uploaded {dateFormatter.format(new Date(createdAt))}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" aria-label="Download">
          <Download className="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="default">
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
            <DropdownMenuItem>
              <Pencil aria-hidden="true" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Move aria-hidden="true" />
              Move
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
