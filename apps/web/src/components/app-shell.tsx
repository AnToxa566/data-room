import type { ReactNode } from 'react';

import type { User } from '@dataroom/contracts';

import { AppSidebar } from './app-sidebar';
import { AppTopbar } from './app-topbar';

interface AppShellProps {
  user: Pick<User, 'name' | 'email'>;
  children: ReactNode;
  /** The Data Room currently being browsed, if any — highlights that room's sidebar entry.
   * See `NavSection`. Omitted on routes with no "current room" concept, e.g. `/home`. */
  activeDataRoomId?: string;
  /** Ids of every `FOLDER`/`FILE`-type "Shared with me" entry that's active for the
   * current view — see `NavSection`. `DATA_ROOM`-type shares need no separate id; they
   * already match `activeDataRoomId`. */
  activeSharedItemIds?: string[];
  /** Set only for a signed-in, non-owner visitor (a share recipient) — see
   * `folder-route.tsx`/`file-route.tsx`. Undefined for the owner's own view (`/home`
   * never passes it), which renders byte-identical to before this prop existed.
   * Threaded down to `AppTopbar`'s narrow-viewport badge; the wide-viewport placement
   * lives inline in `FolderToolbar`/`FileViewerHeader` instead (see `ReadOnlyBadge`). */
  sharedByEmail?: string;
}

/**
 * The authenticated app shell: a fixed sidebar at ≥900px, a top bar below it — the
 * same split the design uses for the room list, the folder browser, and the file
 * viewer, so this is meant to wrap all of those, not just `/home`. Replaces the old
 * shared `<Header/>` for every authenticated route (see `root-route.tsx`).
 *
 * Also used, unmodified, for a *signed-in* share recipient viewing a folder/Data
 * Room/file that isn't theirs — the design keeps the sidebar for that case too, just
 * with a read-only badge and simplified breadcrumbs layered on inside `children` (see
 * `sharedByEmail` and `folder-route.tsx`). A *signed-out* visitor never reaches this
 * component at all — those routes render `Header` instead.
 */
export function AppShell({
  user,
  children,
  activeDataRoomId,
  activeSharedItemIds,
  sharedByEmail,
}: AppShellProps) {
  return (
    <div className="flex flex-1 items-stretch">
      <AppSidebar
        user={user}
        activeDataRoomId={activeDataRoomId}
        activeSharedItemIds={activeSharedItemIds}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar sharedByEmail={sharedByEmail} />
        {children}
      </main>
    </div>
  );
}
