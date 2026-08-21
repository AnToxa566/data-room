import { createRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { FileViewerDocument } from '../components/file-viewer-document';
import { FileViewerHeader } from '../components/file-viewer-header';
import { FileViewerSkeleton } from '../components/file-viewer-skeleton';
import { useDataRoomsQuery } from '../lib/data-rooms';
import { useDocumentTitle } from '../lib/document-title';
import { useFileQuery } from '../lib/files';
import { useFolderQuery } from '../lib/folders';
import { rootRoute } from './root-route';

export const fileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files/$fileId',
  beforeLoad: ({ context }) => {
    if (context.auth.status === 'unauthenticated') {
      throw redirect({ to: '/' });
    }
  },
  component: FilePage,
});

function FilePage() {
  const { auth } = fileRoute.useRouteContext();
  const { fileId } = fileRoute.useParams();
  // Called unconditionally, before the early return below — rules of hooks, same
  // reasoning as `folder-route.tsx`.
  const file = useFileQuery(fileId);
  // Not known until `file` resolves — `useFolderQuery`'s `enabled` stays off until then,
  // same "gate on an earlier query's result" shape `DeleteFolderDialog` uses for stats.
  const folderId = file.data?.body.folderId;
  const folder = useFolderQuery(folderId ?? '', { enabled: !!folderId });
  // Dedupes against the sidebar's/Home's own call (see `lib/data-rooms.ts`) — used only to
  // resolve the owning room's display name when the containing folder is root, same as
  // `folder-route.tsx`'s own `roomName`.
  const dataRooms = useDataRoomsQuery();

  const roomName =
    (folder.isSuccess &&
      dataRooms.data?.body.items.find((room) => room.id === folder.data.body.dataRoomId)
        ?.name) ||
    folder.data?.body.name ||
    '';
  // Same rule as `folder-route.tsx`'s `displayName`: the root folder's own `name` column
  // is a fixed constant, not the room's name.
  const backLabel = folder.data?.body.isRoot ? roomName : folder.data?.body.name || '';
  useDocumentTitle(
    file.data?.body.name ? `${file.data.body.name} — Data Red Rooms` : 'Data Red Rooms',
  );

  if (auth.status !== 'authenticated') return null;

  const isPending = file.isPending || folder.isPending;
  const isError = file.isError || folder.isError;

  return (
    <AppShell user={auth.user} activeDataRoomId={file.data?.body.dataRoomId}>
      <div data-testid="file-page" className="flex min-h-0 flex-1 flex-col">
        {isPending && <FileViewerSkeleton />}
        {isError && (
          <p role="alert" className="pt-14 text-center text-sm text-destructive">
            Couldn&apos;t load this file. Try refreshing the page.
          </p>
        )}
        {file.isSuccess && folder.isSuccess && (
          <>
            <FileViewerHeader
              backLabel={backLabel}
              size={file.data.body.size}
              fileName={file.data.body.name}
              folderId={file.data.body.folderId}
              createdAt={file.data.body.createdAt}
            />
            <FileViewerDocument
              fileId={file.data.body.id}
              status={file.data.body.status}
              fileName={file.data.body.name}
              mimeType={file.data.body.mimeType}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
