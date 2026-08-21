import { Link } from '@tanstack/react-router';
import { Archive } from 'lucide-react';

import { cn } from '@dataroom/ui/lib/utils';

export interface NavItem {
  id: string;
  name: string;
  /** Root folder to navigate into on click. `null` only mid-creation-transaction — see
   * ARCHITECTURE.md §4 — so a listed room's is effectively always set; the fallback below
   * is defensive, not a real state this renders in practice. */
  rootFolderId: string | null;
}

interface NavSectionProps {
  title: string;
  /** Shown when `items` is empty or not yet wired up to a data source. */
  emptyText: string;
  items?: NavItem[];
  /** The Data Room currently being browsed, if any — see `activeDataRoomId` on
   * `AppShell`/`AppSidebar`. Compared against each item's `id`, not the route's folder id,
   * so a room stays highlighted while browsing any of its subfolders, not just its root. */
  activeDataRoomId?: string;
}

const itemClassName =
  'group flex w-full items-center gap-2 rounded-sm py-2 pr-2 pl-1.5 text-left text-sm outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * One labelled block in `AppSidebar` ("Your Data Rooms" / "Shared with me"). Each item
 * links to its room's root folder — see `folder-route.tsx`. The active item (design:
 * accent-tinted background, accent left bar, accent icon) is determined by `activeDataRoomId`,
 * not by `Link`'s own route-match tracking — a room's nav entry links to its *root* folder,
 * so `Link`'s automatic `data-status="active"` would only ever be true there, going dark the
 * moment you browse into a subfolder. Comparing ids instead keeps the room highlighted for
 * its whole subtree.
 */
export function NavSection({ title, emptyText, items = [], activeDataRoomId }: NavSectionProps) {
  return (
    <div>
      <div className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-2 text-[13px] text-muted-foreground">{emptyText}</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const isActive = item.id === activeDataRoomId;
            const mark = (
              <span
                aria-hidden="true"
                className={cn('w-0.75 shrink-0 self-stretch', isActive ? 'bg-accent' : 'bg-transparent')}
              />
            );
            const icon = (
              <Archive
                className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'text-muted-foreground')}
                aria-hidden="true"
              />
            );
            const className = cn(itemClassName, isActive && 'bg-accent/10');

            return item.rootFolderId ? (
              <li key={item.id}>
                <Link
                  to="/folders/$id"
                  params={{ id: item.rootFolderId }}
                  className={className}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {mark}
                  {icon}
                  <span className="truncate">{item.name}</span>
                </Link>
              </li>
            ) : (
              <li key={item.id}>
                <button type="button" className={className}>
                  {mark}
                  {icon}
                  <span className="truncate">{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
