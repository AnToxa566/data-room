import { ChevronRight, CornerDownRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import type { Breadcrumb } from '@dataroom/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dataroom/ui';

interface FolderBreadcrumbsProps {
  /** The Data Room's display name — swapped in for the root folder's real name (a fixed
   * `'/'` constant on the server, see `apps/api/src/data-rooms/data-rooms.service.ts`). */
  roomName: string;
  /** `folder.data.body.breadcrumbs` — root-first, and includes the current folder itself as
   * the last entry (see `apps/api/src/folders/folders.service.ts#get`). */
  breadcrumbs: Breadcrumb[];
}

const MAX_VISIBLE = 4; // room + 3 folders, before "Data Rooms" is added in front

/**
 * `Data Rooms > <Room> > <Folder> > <Folder>` — the design's "Browser" breadcrumb
 * (`Data Red Room.dc.html`, "Browser — root"/"Browser — deep path"). Collapses to
 * `Data Rooms > <Room> > … > <Folder> > <Folder>` past 5 total segments; `…` opens a
 * dropdown of the hidden folders, each a real link (`Data Red Room.dc.html`'s own version
 * hand-rolls that dropdown's focus/escape/click-outside handling — Radix's `DropdownMenu`
 * gives all of that for free, so this reuses it instead of copying that part).
 */
export function FolderBreadcrumbs({ roomName, breadcrumbs }: FolderBreadcrumbsProps) {
  // Index 0 is always the root folder (breadcrumbs is root-first) — its stored name is the
  // literal `'/'` constant, never the room's display name.
  const chain = breadcrumbs.map((crumb, index) =>
    index === 0 ? { id: crumb.id, name: roomName } : crumb,
  );
  const collapsed = chain.length > MAX_VISIBLE;
  const visible = collapsed
    ? [chain[0], chain[chain.length - 2], chain[chain.length - 1]]
    : chain;
  const hidden = collapsed ? chain.slice(1, chain.length - 2) : [];
  const lastId = chain[chain.length - 1]?.id;

  return (
    <nav aria-label="Breadcrumb" className="flex min-h-7 flex-wrap items-center gap-1.5">
      <Link
        to="/home"
        aria-label="Go to your Data Rooms"
        className="rounded-sm text-[13px] text-muted-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Data Rooms
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />

      {crumbLink(visible[0], visible[0].id === lastId)}

      {collapsed && (
        <>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label="Show hidden folders"
              >
                …
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {hidden.map((crumb) => (
                <DropdownMenuItem key={crumb.id} asChild>
                  <Link to="/folders/$id" params={{ id: crumb.id }}>
                    <CornerDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {crumb.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {visible.slice(1).map((crumb) => (
        <span key={crumb.id} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {crumbLink(crumb, crumb.id === lastId)}
        </span>
      ))}
    </nav>
  );
}

function crumbLink(crumb: { id: string; name: string }, current: boolean) {
  if (current) {
    return (
      <span
        aria-current="page"
        className="max-w-60 truncate font-heading text-sm font-extrabold text-foreground"
      >
        {crumb.name}
      </span>
    );
  }
  return (
    <Link
      to="/folders/$id"
      params={{ id: crumb.id }}
      className="max-w-60 truncate rounded-sm text-[13px] text-muted-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {crumb.name}
    </Link>
  );
}
