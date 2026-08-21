import { Link } from '@tanstack/react-router';
import { Archive } from 'lucide-react';

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
}

const itemClassName =
  'group flex w-full items-center gap-2 rounded-sm py-2 pr-2 pl-1.5 text-left text-sm outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-accent/10';

/**
 * One labelled block in `AppSidebar` ("Your Data Rooms" / "Shared with me"). Each item
 * links to its room's root folder — see `folder-route.tsx`. The active item (design:
 * accent-tinted background, accent left bar, accent icon) is whichever room's link
 * matches the current route — `Link` tracks that itself (`data-status="active"`, plus
 * the `aria-current="page"` it sets automatically), so no manual "am I on this room"
 * state is needed here. Only ever true for the room whose root folder is the current
 * page today (no subfolder navigation exists yet) — revisit once folders can be browsed
 * below the root.
 */
export function NavSection({ title, emptyText, items = [] }: NavSectionProps) {
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
            const mark = (
              <span
                aria-hidden="true"
                className="w-0.75 shrink-0 self-stretch bg-transparent group-data-[status=active]:bg-accent"
              />
            );
            const icon = (
              <Archive
                className="size-4 shrink-0 text-muted-foreground group-data-[status=active]:text-accent"
                aria-hidden="true"
              />
            );

            return item.rootFolderId ? (
              <li key={item.id}>
                <Link to="/folders/$id" params={{ id: item.rootFolderId }} className={itemClassName}>
                  {mark}
                  {icon}
                  <span className="truncate">{item.name}</span>
                </Link>
              </li>
            ) : (
              <li key={item.id}>
                <button type="button" className={itemClassName}>
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
