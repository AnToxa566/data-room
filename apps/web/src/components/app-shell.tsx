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
}

/**
 * The authenticated app shell: a fixed sidebar at ≥900px, a top bar below it — the
 * same split the design uses for the room list, the folder browser, and the file
 * viewer, so this is meant to wrap all of those, not just `/home`. Replaces the old
 * shared `<Header/>` for every authenticated route (see `root-route.tsx`).
 */
export function AppShell({ user, children, activeDataRoomId }: AppShellProps) {
  return (
    <div className="flex flex-1 items-stretch">
      <AppSidebar user={user} activeDataRoomId={activeDataRoomId} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        {children}
      </main>
    </div>
  );
}
