import { Link } from '@tanstack/react-router';

import { ReadOnlyBadge } from './read-only-badge';

interface AppTopbarProps {
  /** Set only for a signed-in, non-owner visitor — see `AppShell`'s doc comment. Swaps
   * the "All rooms" link for the read-only badge; owner routes never pass it. */
  sharedByEmail?: string;
}

/** The <900px top bar — brand + a link back to the room list (owner), or the read-only
 * badge (signed-in recipient). Sign-out lives in `AppSidebar` only; there's no
 * narrow-viewport equivalent yet since `/home` is the only owner-only authenticated
 * route today. */
export function AppTopbar({ sharedByEmail }: AppTopbarProps) {
  return (
    <div className="flex items-center gap-2.5 border-b-2 border-border bg-card p-3 px-4 min-[900px]:hidden">
      <Link
        to="/home"
        aria-label="Go to your Data Rooms"
        className="flex items-center gap-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="size-4 shrink-0 bg-accent" />
        <span className="font-heading text-[13px] font-extrabold text-foreground">
          DATA RED ROOM
        </span>
      </Link>
      {sharedByEmail ? (
        <ReadOnlyBadge sharedByEmail={sharedByEmail} className="ml-auto" />
      ) : (
        <Link
          to="/home"
          className="ml-auto rounded-sm border border-border px-2.5 py-1.5 text-xs font-medium text-foreground outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          All rooms
        </Link>
      )}
    </div>
  );
}
