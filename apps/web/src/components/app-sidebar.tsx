import { Link } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';

import type { User } from '@dataroom/contracts';

import { useSignOut } from '../lib/auth';
import { useDataRoomsQuery } from '../lib/data-rooms';
import { useSharedWithMeQuery } from '../lib/shares';
import { NavSection } from './nav-section';

interface AppSidebarProps {
  user: Pick<User, 'name' | 'email'>;
  /** The Data Room currently being browsed, if any — see `NavSection`. */
  activeDataRoomId?: string;
  /** Ids of every `FOLDER`/`FILE`-type "Shared with me" entry that's active for the
   * current view — see `NavSection`. */
  activeSharedItemIds?: string[];
}

/**
 * The ≥900px left rail — brand, nav, sign-out. Owns everything the old shared
 * `<Header/>` used to for authenticated users; see `app-shell.tsx` for why it
 * replaces `<Header/>` rather than sitting alongside it.
 */
export function AppSidebar({ user, activeDataRoomId, activeSharedItemIds }: AppSidebarProps) {
  const signOut = useSignOut();
  // No loading/error treatment here beyond falling back to `NavSection`'s `emptyText` —
  // the Home route (routes/home-route.tsx) owns the real loading/error UI for this same
  // query; react-query dedupes the two `useDataRoomsQuery()` calls into one request.
  const dataRooms = useDataRoomsQuery();
  // Only rooms this user owns — a room shared with them (`access !== 'OWNER'`) now
  // surfaces under "Shared with me" instead (via `useSharedWithMeQuery`), not here too.
  // See the Home route for the identical filter, applied for the identical reason.
  const myRooms = dataRooms.data?.body.items
    .filter((room) => room.access === 'OWNER')
    .map((room) => ({
      id: room.id,
      name: room.name,
      rootFolderId: room.rootFolderId,
    }));

  const sharedWithMe = useSharedWithMeQuery();
  const sharedItems = sharedWithMe.data?.body.items.map((item) => ({
    id: item.resourceId,
    name: item.name,
    rootFolderId: item.resourceType !== 'FILE' ? item.folderId : null,
    fileId: item.resourceType === 'FILE' ? item.resourceId : null,
    kind:
      item.resourceType === 'DATA_ROOM'
        ? ('room' as const)
        : item.resourceType === 'FOLDER'
          ? ('folder' as const)
          : ('file' as const),
  }));

  return (
    <aside className="hidden w-67 shrink-0 flex-col border-r-2 border-border bg-card min-[900px]:flex">
      <div className="border-b-2 border-border">
        <Link
          to="/home"
          aria-label="Go to your Data Rooms"
          className="flex w-full items-center gap-2.5 p-5 text-left outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className="size-5 shrink-0 bg-accent" />
          <span className="font-heading text-[15px] font-extrabold tracking-tight text-foreground">
            DATA RED ROOM
          </span>
        </Link>
      </div>

      <nav aria-label="Your Data Rooms" className="flex flex-col gap-5 p-3 pt-4">
        <NavSection
          title="Your Data Rooms"
          emptyText="None yet"
          items={myRooms}
          activeDataRoomId={activeDataRoomId}
        />
        <NavSection
          title="Shared with me"
          emptyText="Nothing shared with you"
          items={sharedItems}
          activeDataRoomId={activeDataRoomId}
          activeSharedItemIds={activeSharedItemIds}
        />
      </nav>

      <div className="mt-auto border-t-2 border-border p-3">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-sm p-2 cursor-pointer text-left text-[13px] text-foreground outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{user.email}</span>
          <span className="text-[11px] text-muted-foreground">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
