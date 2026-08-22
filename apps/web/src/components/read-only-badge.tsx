import { Lock } from 'lucide-react';

import { cn } from '@dataroom/ui';

interface ReadOnlyBadgeProps {
  /** The email of whoever created the share that grants the current, non-owner caller
   * access — see `FolderWithBreadcrumbs.sharedByEmail`/`FileWithAccessContext.sharedByEmail`. */
  sharedByEmail: string;
  className?: string;
}

/**
 * "Read-only · Shared by {email}" — the badge every non-owner view (folder, Data Room,
 * or file; signed in or signed out) shows somewhere, per the design
 * (`Data Red Room.dc.html`'s `recSharedBy` text). Placement is mutually exclusive by CSS
 * breakpoint across its three call sites (`AppTopbar`, `Header`, and inline in
 * `FolderToolbar`/`FileViewerHeader`) — never JS media-query state, matching every other
 * responsive split in this codebase.
 */
export function ReadOnlyBadge({ sharedByEmail, className }: ReadOnlyBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px] text-foreground/85',
        className,
      )}
    >
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">Read-only · Shared by {sharedByEmail}</span>
    </span>
  );
}
