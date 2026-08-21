import { useState } from 'react';
import { createRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { CreateDataRoomDialog } from '../components/create-data-room-dialog';
import { HomeDataRoomsTable } from '../components/home-data-rooms-table';
import { HomeEmptyState } from '../components/home-empty-state';
import { HomeHeader } from '../components/home-header';
import { useDataRoomsQuery } from '../lib/data-rooms';
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

  // `beforeLoad` above already redirects unauthenticated visitors away, so `auth` is
  // always the authenticated branch by the time this renders.
  if (auth.status !== 'authenticated') return null;

  return (
    <AppShell user={auth.user}>
      <div
        data-testid="home-page"
        className="px-4 pt-4 pb-10 min-[900px]:px-10 min-[900px]:pt-7 min-[900px]:pb-14"
      >
        <HomeHeader onNewRoom={() => setCreateOpen(true)} />
        {dataRooms.isPending && (
          <p className="pt-14 text-sm text-muted-foreground">Loading your Data Rooms…</p>
        )}
        {dataRooms.isError && (
          <p role="alert" className="pt-14 text-sm text-destructive">
            Couldn&apos;t load your Data Rooms. Try refreshing the page.
          </p>
        )}
        {dataRooms.isSuccess && dataRooms.data.body.items.length === 0 && (
          <HomeEmptyState onNewRoom={() => setCreateOpen(true)} />
        )}
        {dataRooms.isSuccess && dataRooms.data.body.items.length > 0 && (
          <HomeDataRoomsTable rooms={dataRooms.data.body.items} />
        )}
      </div>
      <CreateDataRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppShell>
  );
}
