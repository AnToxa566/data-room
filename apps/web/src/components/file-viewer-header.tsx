import { useState } from 'react';
import { ArrowLeft, Download, MoreVertical, Move, Pencil, Share2, Trash2 } from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';

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
import { RenameFileDialog } from './rename-file-dialog';

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface FileViewerHeaderProps {
  fileId: string;
  fileName: string;
  /** Raw byte count as a string — same wire shape as `File.size`; formatted here with
   * `formatBytes`, same as every other size cell in the app. */
  size: string;
  createdAt: string;
  /** The containing folder — `Back` returns here, and it's where a rename/move
   * invalidates and where a Cancel-free "Move" dialog starts browsing from. */
  folderId: string;
  /** The room name if the containing folder is root, its own name otherwise — same rule
   * `folder-route.tsx` uses for `displayName`. */
  backLabel: string;
}

/**
 * The file viewer's top bar (the design's `isFileView` header): a Back button to the
 * containing folder/room, the file name + a "size · uploaded" stats line, and the
 * Download/Share/kebab actions. Rename/Move/Delete each open their own modal — same three
 * dialogs `FolderChildrenTable` uses, just with one file instead of a per-row target — and
 * Download fires `useDownloadFile()` directly, same as the table's own Download item.
 * Share stays inert, same as everywhere else in the app.
 */
export function FileViewerHeader({
  fileId,
  fileName,
  size,
  createdAt,
  folderId,
  backLabel,
}: FileViewerHeaderProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const downloadFile = useDownloadFile();
  const navigate = useNavigate();

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
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Download"
          onClick={() => downloadFile({ id: fileId, name: fileName })}
        >
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
      </div>

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
    </div>
  );
}
