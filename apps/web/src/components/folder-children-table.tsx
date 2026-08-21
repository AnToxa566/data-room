import { useState } from 'react';
import {
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder,
  MoreVertical,
  Move,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';

import type { FolderChildItem } from '@dataroom/contracts';
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
import { DeleteFolderDialog } from './delete-folder-dialog';
import { MoveFileDialog } from './move-file-dialog';
import { RenameFileDialog } from './rename-file-dialog';
import { RenameFolderDialog } from './rename-folder-dialog';

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface FolderChildrenTableProps {
  items: FolderChildItem[];
  /** The currently-viewed folder — every row here is one of its direct children, needed
   * to invalidate the right children list after a rename/delete. */
  parentId: string;
}

/**
 * The populated "Browser" table from the design — folders and files in one ordered list
 * (`FolderChildItem` is a `kind`-discriminated union; see `libs/contracts/src/lib/folders.ts`).
 * Hand-rolled CSS-grid "table", same shape as `HomeDataRoomsTable` — there's no
 * `@tanstack/react-table` (or any table library) anywhere in this repo.
 *
 * A folder row's name navigates into it via `Link`. Open/Rename/Delete in the kebab menu
 * are wired to the same navigation and to their own modals below (one controlled instance
 * each, parameterized by `renameTarget`/`deleteTarget` — same "single shared dialog" shape
 * as `HomeDataRoomsTable`). Share remains inert — still out of scope, matching the Data
 * Room table's own Share item. The design gates Move/Download to file rows only
 * (`sc-if row.isFile`), so folder rows never show them.
 *
 * `kind: 'file'` rows: uploads now populate them (see `lib/upload-manager.tsx`), so this
 * renders the full design row — icon, formatted size, modified date, and a kebab menu in
 * the design's order (View, Rename, Move, Share, Download, Delete). A file row's name and
 * its menu's "View" both navigate to `routes/file-route.tsx` (`/files/$fileId`), same
 * treatment a folder row's name/"Open" get. Rename/Move/Delete each open their own modal
 * (`renameFileTarget`/`moveFileTarget`/`deleteFileTarget`, same "single shared dialog"
 * shape as the folder targets above), Download fires `useDownloadFile()` directly — no
 * modal in the design for it. Share stays inert, same as the folder row's own Share item.
 */
export function FolderChildrenTable({ items, parentId }: FolderChildrenTableProps) {
  const [renameTarget, setRenameTarget] = useState<Extract<
    FolderChildItem,
    { kind: 'folder' }
  > | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Extract<
    FolderChildItem,
    { kind: 'folder' }
  > | null>(null);
  const [renameFileTarget, setRenameFileTarget] = useState<Extract<
    FolderChildItem,
    { kind: 'file' }
  > | null>(null);
  // `folderId` isn't on `FileChildItem` (a listing row doesn't carry its own parent) —
  // `MoveFileDialog` needs it to know the file's current location, so it's filled in from
  // `parentId` when the target is set, not part of the row's own shape.
  const [moveFileTarget, setMoveFileTarget] = useState<{
    id: string;
    name: string;
    folderId: string;
  } | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState<Extract<
    FolderChildItem,
    { kind: 'file' }
  > | null>(null);
  const downloadFile = useDownloadFile();

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-x-2 border-b-2 border-border pt-2.5 pb-2 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase min-[900px]:grid-cols-[minmax(0,1fr)_120px_140px_44px]">
        <div>Name</div>
        <div className="hidden min-[900px]:block">Size</div>
        <div className="hidden min-[900px]:block">Modified</div>
        <div />
      </div>
      {items.map((item) =>
        item.kind === 'folder' ? (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 border-b border-border px-2 min-h-11.5 hover:bg-foreground/4 min-[900px]:grid-cols-[minmax(0,1fr)_120px_140px_44px]"
          >
            <Link
              to="/folders/$id"
              params={{ id: item.id }}
              className="flex min-w-0 items-center gap-2.5 rounded-sm py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Folder className="size-4.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate font-heading text-sm font-extrabold text-foreground">
                {item.name}
              </span>
            </Link>
            <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
              —
            </div>
            <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
              {dateFormatter.format(new Date(item.updatedAt))}
            </div>
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="muted"
                    size="icon"
                    aria-label={`More actions for ${item.name}`}
                  >
                    <MoreVertical className="size-4.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/folders/$id" params={{ id: item.id }}>
                      <ChevronRight aria-hidden="true" />
                      Open
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRenameTarget(item)}>
                    <Pencil aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share2 aria-hidden="true" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(item)}>
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 border-b border-border px-2 min-h-11.5 hover:bg-foreground/4 min-[900px]:grid-cols-[minmax(0,1fr)_120px_140px_44px]"
          >
            <Link
              to="/files/$fileId"
              params={{ fileId: item.id }}
              className="flex min-w-0 items-center gap-2.5 rounded-sm py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <FileText className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate text-sm text-foreground">{item.name}</span>
            </Link>
            <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
              {formatBytes(item.size)}
            </div>
            <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
              {dateFormatter.format(new Date(item.updatedAt))}
            </div>
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="muted"
                    size="icon"
                    aria-label={`More actions for ${item.name}`}
                  >
                    <MoreVertical className="size-4.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/files/$fileId" params={{ fileId: item.id }}>
                      <Eye aria-hidden="true" />
                      View
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRenameFileTarget(item)}>
                    <Pencil aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setMoveFileTarget({ id: item.id, name: item.name, folderId: parentId })}
                  >
                    <Move aria-hidden="true" />
                    Move
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share2 aria-hidden="true" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => downloadFile(item)}>
                    <Download aria-hidden="true" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleteFileTarget(item)}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ),
      )}

      <RenameFolderDialog
        folder={renameTarget}
        parentId={parentId}
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />
      <DeleteFolderDialog
        folder={deleteTarget}
        parentId={parentId}
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
      <RenameFileDialog
        file={renameFileTarget}
        parentId={parentId}
        open={!!renameFileTarget}
        onOpenChange={(open) => {
          if (!open) setRenameFileTarget(null);
        }}
      />
      <MoveFileDialog
        file={moveFileTarget}
        parentId={parentId}
        open={!!moveFileTarget}
        onOpenChange={(open) => {
          if (!open) setMoveFileTarget(null);
        }}
      />
      <DeleteFileDialog
        file={deleteFileTarget}
        parentId={parentId}
        open={!!deleteFileTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteFileTarget(null);
        }}
      />
    </div>
  );
}
