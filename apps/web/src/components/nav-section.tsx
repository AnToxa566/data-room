import { Archive } from 'lucide-react';

export interface NavItem {
  id: string;
  name: string;
}

interface NavSectionProps {
  title: string;
  /** Shown when `items` is empty or not yet wired up to a data source. */
  emptyText: string;
  items?: NavItem[];
}

/**
 * One labelled block in `AppSidebar` ("Your Data Rooms" / "Shared with me"). Neither
 * section has a real item list yet — both currently render `emptyText` — but this
 * takes `items` already so wiring the real list later is a prop, not a rewrite.
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
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
