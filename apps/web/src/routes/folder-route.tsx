import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { CreateFolderDialog } from '../components/create-folder-dialog';
import { FolderChildrenTable } from '../components/folder-children-table';
import { FolderChildrenTableSkeleton } from '../components/folder-children-table-skeleton';
import { FolderEmptyState } from '../components/folder-empty-state';
import { FolderEmptySubfolderState } from '../components/folder-empty-subfolder-state';
import { FolderToolbar } from '../components/folder-toolbar';
import { Header } from '../components/header';
import { useDocumentTitle } from '../lib/document-title';
import { useFolderChildrenQuery, useFolderQuery } from '../lib/folders';
import { rootRoute } from './root-route';

export const folderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/folders/$id',
  // No beforeLoad — a folder or Data Room (routed here via its root folder id) may be a
  // PUBLIC or EMAIL share the API already serves anonymously (see ARCHITECTURE.md §4).
  // The old unconditional "unauthenticated -> redirect to /" guard blocked exactly that
  // visit before the page ever got a chance to try; the API already collapses "not
  // shared with you" into a 404 (ARCHITECTURE.md §7), so the frontend doesn't need to
  // pre-empt that with a client-side redirect — see `home-route.tsx` for the guard that
  // legitimately stays (Home is always owner-only, with no anonymous story at all).
  component: FolderPage,
});

function FolderPage() {
  const { auth } = folderRoute.useRouteContext();
  const { id } = folderRoute.useParams();
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  // Called unconditionally — rules of hooks, and both must run for every caller
  // (owner, signed-in recipient, or anonymous visitor) since none of them redirect away
  // before this component renders any more.
  const folder = useFolderQuery(id);
  const children = useFolderChildrenQuery(id);

  const isOwner = folder.data?.body.isOwner ?? true;
  // `dataRoomName` comes straight off the folder response now (see
  // `libs/contracts/src/lib/folders.ts`) — this used to be resolved via a separate,
  // owner-only `useDataRoomsQuery()` lookup that 401'd for an anonymous visitor and
  // never included a `PUBLIC`-share or folder/file-share recipient's room at all (see
  // `apps/api/src/data-rooms/data-rooms.service.ts`'s own doc comment on `list`).
  const roomName = folder.data?.body.dataRoomName ?? '';
  // The root folder's own `name` column is a fixed constant, not the room's name (see
  // `apps/api/src/data-rooms/data-rooms.service.ts`) — every other folder's `name` is real.
  const displayName = folder.data?.body.isRoot ? roomName : folder.data?.body.name || '';
  // Also called unconditionally, before any early return — same reasoning as the queries
  // above.
  useDocumentTitle(displayName ? `${displayName} — Data Red Rooms` : 'Data Red Rooms');

  const isPending = folder.isPending || children.isPending;
  const isError = folder.isError || children.isError;

  const pageBody = (
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
            folderId={id}
            dataRoomId={folder.data.body.dataRoomId}
            isRoot={folder.data.body.isRoot}
            roomName={roomName}
            displayName={displayName}
            breadcrumbs={folder.data.body.breadcrumbs}
            isOwner={folder.data.body.isOwner}
            signedIn={auth.status === 'authenticated'}
            sharedByEmail={folder.data.body.sharedByEmail}
            sharedRootType={folder.data.body.sharedRootType}
            onNewFolder={() => setCreateFolderOpen(true)}
          />
          {children.data.body.items.length === 0 ? (
            folder.data.body.isRoot ? (
              <FolderEmptyState
                folderId={id}
                roomName={roomName}
                isOwner={folder.data.body.isOwner}
                onNewFolder={() => setCreateFolderOpen(true)}
              />
            ) : (
              <FolderEmptySubfolderState
                folderId={id}
                folderName={displayName}
                isOwner={folder.data.body.isOwner}
                onNewFolder={() => setCreateFolderOpen(true)}
              />
            )
          ) : (
            <FolderChildrenTable
              items={children.data.body.items}
              parentId={id}
              isOwner={folder.data.body.isOwner}
            />
          )}
        </>
      )}
      {folder.isSuccess && isOwner && (
        <CreateFolderDialog
          parentId={id}
          dataRoomId={folder.data.body.dataRoomId}
          folderName={displayName}
          open={createFolderOpen}
          onOpenChange={setCreateFolderOpen}
        />
      )}
    </div>
  );

  // Both the owner and a *signed-in* recipient keep the sidebar shell; only a
  // signed-out visitor gets the chrome-free header instead — see `AppShell`'s and
  // `Header`'s doc comments.
  return auth.status === 'authenticated' ? (
    <AppShell
      user={auth.user}
      activeDataRoomId={folder.data?.body.dataRoomId}
      sharedByEmail={isOwner ? undefined : (folder.data?.body.sharedByEmail ?? undefined)}
    >
      {pageBody}
    </AppShell>
  ) : (
    <>
      <Header
        sharedByEmail={folder.data?.body.sharedByEmail ?? undefined}
        returnTo={window.location.pathname}
      />
      <main className="flex min-w-0 flex-1 flex-col">{pageBody}</main>
    </>
  );
}
