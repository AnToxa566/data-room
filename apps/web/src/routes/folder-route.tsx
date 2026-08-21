import { createRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { FolderEmptyState } from '../components/folder-empty-state';
import { FolderToolbar } from '../components/folder-toolbar';
import { useDataRoomsQuery } from '../lib/data-rooms';
import { useFolderChildrenQuery, useFolderQuery } from '../lib/folders';
import { rootRoute } from './root-route';

export const folderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/folders/$id',
  beforeLoad: ({ context }) => {
    if (context.auth.status === 'unauthenticated') {
      throw redirect({ to: '/' });
    }
  },
  component: FolderPage,
});

function FolderPage() {
  const { auth } = folderRoute.useRouteContext();
  const { id } = folderRoute.useParams();
  // Called unconditionally, before the early return below — rules of hooks, same
  // reasoning as `home-route.tsx`.
  const folder = useFolderQuery(id);
  const children = useFolderChildrenQuery(id);
  // Dedupes against the sidebar's/Home's own call (see `lib/data-rooms.ts`) — used only
  // to look up the owning room's display name; the root folder's own `name` column is a
  // fixed constant, not the room's name (see `apps/api/src/data-rooms/data-rooms.service.ts`).
  const dataRooms = useDataRoomsQuery();

  if (auth.status !== 'authenticated') return null;

  const isPending = folder.isPending || children.isPending;
  const isError = folder.isError || children.isError;

  const roomName =
    (folder.isSuccess &&
      dataRooms.data?.body.items.find((room) => room.id === folder.data.body.dataRoomId)
        ?.name) ||
    folder.data?.body.name ||
    '';

  return (
    <AppShell user={auth.user}>
      <div
        data-testid="folder-page"
        className="px-4 pt-4 pb-10 min-[900px]:px-10 min-[900px]:pt-7 min-[900px]:pb-14"
      >
        {isPending && <p className="pt-14 text-sm text-muted-foreground">Loading…</p>}
        {isError && (
          <p role="alert" className="pt-14 text-sm text-destructive">
            Couldn&apos;t load this folder. Try refreshing the page.
          </p>
        )}
        {folder.isSuccess && children.isSuccess && (
          <>
            <FolderToolbar name={roomName} />
            {children.data.body.items.length === 0 ? (
              <FolderEmptyState roomName={roomName} />
            ) : (
              // Unreachable today — there's no upload/create-folder UI yet, so no root
              // folder can have children. Building the populated browser view is out of
              // scope for this pass; see the plan doc.
              <p className="pt-14 text-sm text-muted-foreground">
                This folder isn&apos;t empty — browsing its contents isn&apos;t built yet.
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
