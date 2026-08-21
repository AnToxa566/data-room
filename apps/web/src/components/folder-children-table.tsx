import { ChevronRight, Folder, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
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

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface FolderChildrenTableProps {
  items: FolderChildItem[];
}

/**
 * The populated "Browser" table from the design — folders and files in one ordered list
 * (`FolderChildItem` is a `kind`-discriminated union; see `libs/contracts/src/lib/folders.ts`).
 * Hand-rolled CSS-grid "table", same shape as `HomeDataRoomsTable` — there's no
 * `@tanstack/react-table` (or any table library) anywhere in this repo.
 *
 * A folder row's name navigates into it via `Link` — the only real interactivity here.
 * Every quick action in the kebab menu (Open/Rename/Share/Delete) is inert on purpose:
 * wiring them up is out of scope for this pass. The design gates Move/Download to file
 * rows only (`sc-if row.isFile`), so folder rows never show them.
 *
 * `kind: 'file'` rows are unreachable today — nothing can create a file child yet (no
 * upload UI) — so that branch is a minimal stub (name, raw size, modified date, no
 * `Link`, no kebab menu) rather than a fully-built file row. Revisit once upload exists.
 */
export function FolderChildrenTable({ items }: FolderChildrenTableProps) {
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
                  <DropdownMenuItem>
                    <ChevronRight aria-hidden="true" />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Pencil aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share2 aria-hidden="true" />
                    Share
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
        ) : (
          // Unreachable today — see the docblock above.
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 border-b border-border px-2 min-h-11.5 min-[900px]:grid-cols-[minmax(0,1fr)_120px_140px_44px]"
          >
            <span className="truncate py-1.5 text-sm text-foreground">{item.name}</span>
            <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
              {item.size}
            </div>
            <div className="hidden text-[13px] text-foreground/85 tabular-nums min-[900px]:block">
              {dateFormatter.format(new Date(item.updatedAt))}
            </div>
            <div />
          </div>
        ),
      )}
    </div>
  );
}
