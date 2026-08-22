import { createRoute } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { FileViewerDocument } from '../components/file-viewer-document';
import { FileViewerHeader } from '../components/file-viewer-header';
import { FileViewerSkeleton } from '../components/file-viewer-skeleton';
import { Header } from '../components/header';
import { NotFoundState } from '../components/not-found-state';
import { isTsRestErrorWithStatus } from '../lib/api';
import { useDocumentTitle } from '../lib/document-title';
import { useFileQuery } from '../lib/files';
import { useFolderQuery } from '../lib/folders';
import { rootRoute } from './root-route';

export const fileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files/$fileId',
  // No beforeLoad — see folder-route.tsx's identical comment; a PUBLIC or EMAIL share on
  // this file (or an ancestor) is already served anonymously by the API.
  component: FilePage,
});

function FilePage() {
  const { auth } = fileRoute.useRouteContext();
  const { fileId } = fileRoute.useParams();
  // Called unconditionally — rules of hooks, same reasoning as `folder-route.tsx`.
  const file = useFileQuery(fileId);

  const isOwner = file.data?.body.isOwner ?? true;
  const sharedRootType = file.data?.body.sharedRootType ?? null;
  // A non-owner whose access to this file comes from a FILE-level share directly on the
  // file itself has no independent access to its containing folder — fetching it would
  // itself 404 (the folder's own shareCandidates never include a FILE-type candidate).
  // Only fetch when the caller can actually see the folder: the owner, or a recipient
  // who was granted access via an ancestor (FOLDER/DATA_ROOM-level share) — see
  // `libs/contracts/src/lib/files.ts`'s `SharedFileRootTypeSchema` doc comment.
  const needsFolderFetch = file.isSuccess && (isOwner || sharedRootType !== 'FILE');
  const folderId = needsFolderFetch ? file.data?.body.folderId : undefined;
  const folder = useFolderQuery(folderId ?? '', { enabled: !!folderId });

  const roomName =
    folder.data && folder.data.body.isRoot ? folder.data.body.dataRoomName : (folder.data?.body.name ?? '');
  // Same rule as `folder-route.tsx`'s `displayName`: the root folder's own `name` column
  // is a fixed constant, not the room's name.
  const backLabel = folder.data?.body.isRoot ? roomName : folder.data?.body.name || '';
  useDocumentTitle(
    file.data?.body.name ? `${file.data.body.name} — Data Red Rooms` : 'Data Red Rooms',
  );

  // A permanently-disabled query (needsFolderFetch === false) never leaves
  // `isPending: true` — folding it in unconditionally would hang the page on its
  // skeleton forever for a FILE-level-share recipient. Only wait on `folder` when it was
  // actually asked to fetch.
  const isPending = file.isPending || (needsFolderFetch && folder.isPending);
  const isError = file.isError || (needsFolderFetch && folder.isError);
  // A 404 on the file itself is the only case `NotFoundState` covers here — when the file
  // 404s, `needsFolderFetch` never fires (see above), so the folder query has nothing to
  // say about "not found" for this route.
  const isNotFound = isTsRestErrorWithStatus(file.error, 404);
  const ready = file.isSuccess && (!needsFolderFetch || folder.isSuccess);

  const pageBody = (
    <div data-testid="file-page" className="flex min-h-0 flex-1 flex-col">
      {isPending && <FileViewerSkeleton />}
      {isNotFound && (
        <NotFoundState
          kind="file"
          signedIn={auth.status === 'authenticated'}
          email={auth.status === 'authenticated' ? auth.user.email : undefined}
        />
      )}
      {isError && !isNotFound && (
        <p role="alert" className="pt-14 text-center text-sm text-destructive">
          Couldn&apos;t load this file. Try refreshing the page.
        </p>
      )}
      {ready && file.data && (
        <>
          <FileViewerHeader
            fileId={file.data.body.id}
            size={file.data.body.size}
            fileName={file.data.body.name}
            createdAt={file.data.body.createdAt}
            isOwner={file.data.body.isOwner}
            signedIn={auth.status === 'authenticated'}
            sharedByEmail={file.data.body.sharedByEmail}
            sharedRootType={file.data.body.sharedRootType}
            folderId={needsFolderFetch ? file.data.body.folderId : undefined}
            backLabel={needsFolderFetch ? backLabel : undefined}
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
  );

  // Both the owner and a *signed-in* recipient keep the sidebar shell; only a
  // signed-out visitor gets the chrome-free header instead — see `AppShell`'s and
  // `Header`'s doc comments.
  return auth.status === 'authenticated' ? (
    <AppShell
      user={auth.user}
      activeDataRoomId={file.data?.body.dataRoomId}
      sharedByEmail={isOwner ? undefined : (file.data?.body.sharedByEmail ?? undefined)}
    >
      {pageBody}
    </AppShell>
  ) : (
    <>
      <Header
        sharedByEmail={file.data?.body.sharedByEmail ?? undefined}
        returnTo={window.location.pathname}
      />
      <main className="flex min-w-0 flex-1 flex-col">{pageBody}</main>
    </>
  );
}
