import { useState } from 'react';
import { createRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { CreateFolderDialog } from '../components/create-folder-dialog';
import { FolderChildrenTable } from '../components/folder-children-table';
import { FolderChildrenTableSkeleton } from '../components/folder-children-table-skeleton';
import { FolderEmptyState } from '../components/folder-empty-state';
import { FolderEmptySubfolderState } from '../components/folder-empty-subfolder-state';
import { FolderToolbar } from '../components/folder-toolbar';
import { useDataRoomsQuery } from '../lib/data-rooms';
import { useDocumentTitle } from '../lib/document-title';
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
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  // Called unconditionally, before the early return below — rules of hooks, same
  // reasoning as `home-route.tsx`.
  const folder = useFolderQuery(id);
  const children = useFolderChildrenQuery(id);
  // Dedupes against the sidebar's/Home's own call (see `lib/data-rooms.ts`) — used only
  // to look up the owning room's display name; the root folder's own `name` column is a
  // fixed constant, not the room's name (see `apps/api/src/data-rooms/data-rooms.service.ts`).
  const dataRooms = useDataRoomsQuery();

  const roomName =
    (folder.isSuccess &&
      dataRooms.data?.body.items.find((room) => room.id === folder.data.body.dataRoomId)
        ?.name) ||
    folder.data?.body.name ||
    '';
  // The root folder's own `name` column is a fixed constant, not the room's name (see
  // `apps/api/src/data-rooms/data-rooms.service.ts`) — every other folder's `name` is real.
  const displayName = folder.data?.body.isRoot ? roomName : folder.data?.body.name || '';
  // Also called unconditionally, before the early return — same reasoning as the queries
  // above.
  useDocumentTitle(displayName ? `${displayName} — Data Red Rooms` : 'Data Red Rooms');

  if (auth.status !== 'authenticated') return null;

  const isPending = folder.isPending || children.isPending;
  const isError = folder.isError || children.isError;

  return (
    <AppShell user={auth.user} activeDataRoomId={folder.data?.body.dataRoomId}>
      <div
        data-testid="folder-page"
        className="px-4 pt-4 pb-10 min-[900px]:px-10 min-[900px]:pt-7 min-[900px]:pb-14"
      >
        {isPending && <FolderChildrenTableSkeleton />}
        {isError && (
          <p role="alert" className="pt-14 text-sm text-destructive">
            Couldn&apos;t load this folder. Try refreshing the page.
          </p>
        )}
        {folder.isSuccess && children.isSuccess && (
          <>
            <FolderToolbar
              roomName={roomName}
              displayName={displayName}
              breadcrumbs={folder.data.body.breadcrumbs}
              onNewFolder={() => setCreateFolderOpen(true)}
            />
            {children.data.body.items.length === 0 ? (
              folder.data.body.isRoot ? (
                <FolderEmptyState
                  roomName={roomName}
                  onNewFolder={() => setCreateFolderOpen(true)}
                />
              ) : (
                <FolderEmptySubfolderState onNewFolder={() => setCreateFolderOpen(true)} />
              )
            ) : (
              <FolderChildrenTable items={children.data.body.items} />
            )}
          </>
        )}
      </div>
      {folder.isSuccess && (
        <CreateFolderDialog
          parentId={id}
          dataRoomId={folder.data.body.dataRoomId}
          folderName={displayName}
          open={createFolderOpen}
          onOpenChange={setCreateFolderOpen}
        />
      )}
    </AppShell>
  );
}
