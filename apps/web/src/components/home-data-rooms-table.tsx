import { useState } from 'react';
import { Archive, MoreVertical } from 'lucide-react';

import type { DataRoomListItem } from '@dataroom/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dataroom/ui';

import { DeleteDataRoomDialog } from './delete-data-room-dialog';
import { RenameDataRoomDialog } from './rename-data-room-dialog';

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface HomeDataRoomsTableProps {
  rooms: DataRoomListItem[];
}

/**
 * The "Owned by you" list on the populated Home page. The design's table has "Items" and
 * "Size" columns — `DataRoomListItem` carries neither (nothing computes them yet), so this
 * shows "Created" instead; see the plan doc for why. Row names are deliberately
 * non-interactive (no click-to-open, no redirect) — that's explicitly out of scope for
 * this pass, unlike the "New Data Room" CTAs. Rename and Delete are wired to their own
 * modals below (one controlled instance each, parameterized by `renameTarget`/
 * `deleteTarget` — same "single shared dialog" shape as `CreateDataRoomDialog`, just
 * keyed to whichever row's quick action was used). Share remains inert — still out of
 * scope.
 */
export function HomeDataRoomsTable({ rooms }: HomeDataRoomsTableProps) {
  const [renameTarget, setRenameTarget] = useState<DataRoomListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DataRoomListItem | null>(null);

  return (
    <section className="pt-7" aria-labelledby="owned-by-you-heading">
      <h2
        id="owned-by-you-heading"
        className="mb-2 text-[13px] font-medium tracking-wide text-foreground/85 uppercase"
      >
        Owned by you
      </h2>
      <div className="grid grid-cols-[minmax(0,1fr)_44px] border-b-2 border-border pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase min-[900px]:grid-cols-[minmax(0,1fr)_140px_44px]">
        <div>Name</div>
        <div className="hidden min-[900px]:block">Created</div>
        <div />
      </div>
      {rooms.map((room) => (
        <div
          key={room.id}
          className="grid grid-cols-[minmax(0,1fr)_44px] items-center border-b border-border min-h-11.5 min-[900px]:grid-cols-[minmax(0,1fr)_140px_44px]"
        >
          <div className="flex min-w-0 items-center gap-2.5 py-1.5">
            <Archive
              className="size-4.5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span className="truncate font-heading text-sm font-extrabold text-foreground">
              {room.name}
            </span>
          </div>
          <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
            {dateFormatter.format(new Date(room.createdAt))}
          </div>
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`More actions for ${room.name}`}
                >
                  <MoreVertical className="size-4.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenameTarget(room)}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem>Share</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteTarget(room)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}

      <RenameDataRoomDialog
        room={renameTarget}
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />
      <DeleteDataRoomDialog
        room={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
