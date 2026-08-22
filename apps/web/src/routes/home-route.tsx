import { useState } from 'react';
import { createRoute, redirect } from '@tanstack/react-router';

import { Skeleton } from '@dataroom/ui';

import { AppShell } from '../components/app-shell';
import { CreateDataRoomDialog } from '../components/create-data-room-dialog';
import { HomeDataRoomsTable } from '../components/home-data-rooms-table';
import { HomeDataRoomsTableSkeleton } from '../components/home-data-rooms-table-skeleton';
import { HomeEmptyState } from '../components/home-empty-state';
import { HomeHeader } from '../components/home-header';
import { HomeSharedWithMeTable } from '../components/home-shared-with-me-table';
import { useDataRoomsQuery } from '../lib/data-rooms';
import { useDocumentTitle } from '../lib/document-title';
import { useSharedWithMeQuery } from '../lib/shares';
import { rootRoute } from './root-route';

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  beforeLoad: ({ context }) => {
    if (context.auth.status === 'unauthenticated') {
      throw redirect({ to: '/' });
    }
  },
  component: HomePage,
});

function HomePage() {
  const { auth } = homeRoute.useRouteContext();
  const [createOpen, setCreateOpen] = useState(false);
  // Called unconditionally, before the early return below — rules of hooks. Harmless to
  // fire while `auth` is still resolving to its authenticated branch (see the `if` right
  // after): the query itself doesn't depend on `auth`.
  const dataRooms = useDataRoomsQuery();
  const sharedWithMe = useSharedWithMeQuery();
  useDocumentTitle('Home — Data Red Rooms');

  // `beforeLoad` above already redirects unauthenticated visitors away, so `auth` is
  // always the authenticated branch by the time this renders.
  if (auth.status !== 'authenticated') return null;

  // `GET /data-rooms` mixes rooms this user owns with rooms shared with them
  // (`access !== 'OWNER'`) — the latter now render under "Shared with me" below (via
  // `useSharedWithMeQuery`), so "Owned by you" only ever shows rooms this user owns.
  const ownedRooms = dataRooms.data?.body.items.filter((room) => room.access === 'OWNER');

  return (
    <AppShell user={auth.user}>
      <div
        data-testid="home-page"
        className="px-4 pt-4 pb-10 min-[900px]:px-10 min-[900px]:pt-7 min-[900px]:pb-14"
      >
        <HomeHeader onNewRoom={() => setCreateOpen(true)} />
        {dataRooms.isPending && <HomeDataRoomsTableSkeleton />}
        {dataRooms.isError && (
          <p role="alert" className="pt-14 text-sm text-destructive">
            Couldn&apos;t load your Data Rooms. Try refreshing the page.
          </p>
        )}
        {dataRooms.isSuccess && ownedRooms && ownedRooms.length === 0 && (
          <HomeEmptyState onNewRoom={() => setCreateOpen(true)} />
        )}
        {dataRooms.isSuccess && ownedRooms && ownedRooms.length > 0 && (
          <HomeDataRoomsTable rooms={ownedRooms} />
        )}

        {/* Hidden entirely once we know for sure there's nothing shared — no empty-state
            copy for this section on Home (contrast the sidebar's "Nothing shared with
            you", which stays put since it anchors a fixed nav slot). Still shown while
            pending/errored so a slow or failed load isn't silently invisible. */}
        {!(sharedWithMe.isSuccess && sharedWithMe.data.body.items.length === 0) && (
          <section className="pt-9" aria-labelledby="shared-with-me-heading">
            <div className="flex items-baseline gap-2.5 border-t-2 border-border pt-4">
              <h2
                id="shared-with-me-heading"
                className="text-[13px] font-medium tracking-wide text-foreground/85 uppercase"
              >
                Shared with me
              </h2>
              <span className="text-xs text-muted-foreground">
                Read-only. A Data Room, a folder, or a single file someone else owns.
              </span>
            </div>
            {sharedWithMe.isPending && (
              <div
                className="flex flex-col gap-2 pt-4"
                aria-busy="true"
                aria-label="Loading shared items"
              >
                <Skeleton className="h-11.5 w-full" />
                <Skeleton className="h-11.5 w-full" />
              </div>
            )}
            {sharedWithMe.isError && (
              <p role="alert" className="pt-4 text-sm text-destructive">
                Couldn&apos;t load what&apos;s shared with you. Try refreshing the page.
              </p>
            )}
            {sharedWithMe.isSuccess && sharedWithMe.data.body.items.length > 0 && (
              <HomeSharedWithMeTable items={sharedWithMe.data.body.items} />
            )}
          </section>
        )}
      </div>
      <CreateDataRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppShell>
  );
}
