import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { DataRoomListItem, File as ContractFile, Folder, User } from '@dataroom/contracts';

import { renderRouterAt } from '../test/render-app';

const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const room: DataRoomListItem = {
  id: 'room-1',
  name: 'Project Halyard',
  ownerId: mockUser.id,
  rootFolderId: 'folder-1',
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
  access: 'OWNER',
};

const rootFolder: Folder = {
  id: 'folder-1',
  name: 'root',
  dataRoomId: room.id,
  parentId: null,
  path: '/folder-1/',
  depth: 0,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const subfolder: Folder = {
  id: 'folder-2',
  name: 'Legal',
  dataRoomId: room.id,
  parentId: rootFolder.id,
  path: '/folder-1/folder-2/',
  depth: 1,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const file: ContractFile = {
  id: 'file-1',
  name: 'NDA.pdf',
  dataRoomId: room.id,
  folderId: rootFolder.id,
  size: '2097152',
  mimeType: 'application/pdf',
  status: 'READY',
  createdAt: '2026-01-06T00:00:00.000Z',
  updatedAt: '2026-01-06T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The access-context fields every `GET /folders/:id`/`GET /files/:id` response now
 * carries (see `libs/contracts/src/lib/folders.ts`/`files.ts`) — every scenario in this
 * file is `mockUser` browsing their own room as its owner, so these are identical
 * everywhere. Not needed on `PATCH /files/:id` responses — that endpoint's 200 is still
 * plain `FileSchema`, unchanged by this contract extension. */
const OWNER_FOLDER_FIELDS = {
  dataRoomName: room.name,
  isOwner: true,
  sharedByEmail: null,
  sharedRootType: null,
} as const;
const OWNER_FILE_FIELDS = {
  isOwner: true,
  sharedByEmail: null,
  sharedRootType: null,
} as const;

/**
 * `FilePage` calls `useFileQuery`, `useFolderQuery` (for the containing folder's
 * breadcrumb/back-button data), and `useDataRoomsQuery` (for the room name) — three real
 * `fetch`es, same "no MSW" reasoning as `stubFolderApi` in `folder-route.spec.tsx`.
 */
function stubFileApi({
  fileOverride = file,
  folder = rootFolder,
  fileStatus = 200,
  downloadUrlStatus = 200,
}: {
  fileOverride?: ContractFile;
  folder?: Folder;
  fileStatus?: number;
  downloadUrlStatus?: number;
} = {}) {
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/data-rooms')) {
      return jsonResponse({ items: [room], nextCursor: null });
    }
    if (url.includes(`/files/${fileOverride.id}/download-url`)) {
      if (downloadUrlStatus !== 200) {
        return jsonResponse({ message: 'This file is not ready yet.' }, downloadUrlStatus);
      }
      return jsonResponse({
        url: 'https://storage.googleapis.com/bucket/signed-nda.pdf',
        expiresAt: '2026-01-06T01:00:00.000Z',
      });
    }
    if (url.includes(`/files/${fileOverride.id}`)) {
      if (fileStatus !== 200) return jsonResponse({ message: 'Not found.' }, fileStatus);
      return jsonResponse({ ...fileOverride, ...OWNER_FILE_FIELDS });
    }
    if (url.includes(`/folders/${folder.id}`)) {
      return jsonResponse({
        ...folder,
        breadcrumbs: [{ id: folder.id, name: folder.name }],
        isRoot: folder.parentId === null,
        ...OWNER_FOLDER_FIELDS,
      });
    }
    // `ShareDialog` (opened from `FileViewerHeader`'s "Share" button) always queries the
    // file's current shares — no test here exercises granting/revoking, so this is just
    // enough to let the dialog render without an "unhandled fetch" throw.
    if (url.includes('/shares')) {
      return jsonResponse({ items: [], nextCursor: null });
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FilePage — a READY PDF in the room root', () => {
  it('renders the header (name, size, upload date) and embeds the signed URL in an iframe', async () => {
    stubFileApi();
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    expect(await within(page).findByText('NDA.pdf')).toBeTruthy();
    expect(within(page).getByText(/2\.0 MB · Uploaded/)).toBeTruthy();

    const iframe = await within(page).findByTitle('NDA.pdf');
    expect(iframe.getAttribute('src')).toBe('https://storage.googleapis.com/bucket/signed-nda.pdf');
  });

  it('labels the Back button with the room name (root folder) and returns there', async () => {
    stubFileApi();
    const { router } = renderRouterAt('/files/file-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('file-page');
    const back = await within(page).findByRole('link', { name: /Project Halyard/ });
    fireEvent.click(back);

    await waitFor(() => expect(router.state.location.pathname).toBe('/folders/folder-1'));
  });

  it('sets the document title to the file name once loaded', async () => {
    stubFileApi();
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    await waitFor(() => expect(document.title).toBe('NDA.pdf — Data Red Rooms'));
  });

  it('opens ShareDialog for the file', async () => {
    stubFileApi();
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');

    fireEvent.click(within(page).getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Share file')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'NDA.pdf' })).toBeTruthy();
  });
});

describe('FilePage — downloading a file', () => {
  it('fetches a signed URL, opens it, and toasts', async () => {
    const fetchMock = stubFileApi();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');
    fireEvent.click(within(page).getByRole('button', { name: 'Download' }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://storage.googleapis.com/bucket/signed-nda.pdf',
        '_blank',
      ),
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Downloading "NDA.pdf"',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (typeof input === 'string' ? input : input.toString()).includes('/download-url'),
      ),
    ).toBe(true);

    openSpy.mockRestore();
  });
});

describe('FilePage — renaming a file', () => {
  it('disables Save and shows a loading label while in flight, closes the dialog, and toasts on success', async () => {
    let resolvePatch!: (response: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/data-rooms') && method === 'GET') {
          return jsonResponse({ items: [room], nextCursor: null });
        }
        if (url.includes('/files/file-1') && method === 'PATCH') {
          return pendingPatch;
        }
        if (url.includes('/files/file-1') && method === 'GET') {
          return jsonResponse({ ...file, ...OWNER_FILE_FIELDS });
        }
        if (url.includes('/folders/folder-1') && method === 'GET') {
          return jsonResponse({
            ...rootFolder,
            breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
            isRoot: true,
            ...OWNER_FOLDER_FIELDS,
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      }),
    );

    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');
    fireEvent.pointerDown(within(page).getByRole('button', { name: 'More actions' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const nameInput = await screen.findByLabelText('File name');
    expect(nameInput).toHaveProperty('value', 'NDA.pdf');
    fireEvent.change(nameInput, { target: { value: 'NDA (final).pdf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    const savingButton = await screen.findByRole('button', { name: 'Saving…' });
    expect(savingButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);

    resolvePatch(jsonResponse({ ...file, name: 'NDA (final).pdf' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Rename file' })).toBeNull());
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Renamed to "NDA (final).pdf"',
    );
  });
});

describe('FilePage — moving a file', () => {
  it('opens the picker at the Data Room root, navigates into a subfolder, and moves the file there', async () => {
    let resolvePatch!: (response: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/data-rooms') && method === 'GET') {
          return jsonResponse({ items: [room], nextCursor: null });
        }
        if (url.includes('/files/file-1') && method === 'PATCH') {
          return pendingPatch;
        }
        if (url.includes('/files/file-1') && method === 'GET') {
          return jsonResponse({ ...file, ...OWNER_FILE_FIELDS });
        }
        if (url.includes('/folders/folder-1/children') && method === 'GET') {
          return jsonResponse({
            items: [
              {
                kind: 'folder',
                id: subfolder.id,
                name: subfolder.name,
                createdAt: subfolder.createdAt,
                updatedAt: subfolder.updatedAt,
              },
            ],
            nextCursor: null,
          });
        }
        if (url.includes(`/folders/${subfolder.id}/children`) && method === 'GET') {
          return jsonResponse({ items: [], nextCursor: null });
        }
        if (url.includes('/folders/folder-1') && method === 'GET') {
          return jsonResponse({
            ...rootFolder,
            breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
            isRoot: true,
            ...OWNER_FOLDER_FIELDS,
          });
        }
        if (url.includes(`/folders/${subfolder.id}`) && method === 'GET') {
          return jsonResponse({
            ...subfolder,
            breadcrumbs: [
              { id: rootFolder.id, name: rootFolder.name },
              { id: subfolder.id, name: subfolder.name },
            ],
            isRoot: false,
            ...OWNER_FOLDER_FIELDS,
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      }),
    );

    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');
    fireEvent.pointerDown(within(page).getByRole('button', { name: 'More actions' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move' }));

    expect(await screen.findByRole('heading', { name: 'Move file' })).toBeTruthy();
    // Opens at the Data Room root — moving here is disabled, the file is already there.
    expect(await screen.findByText('The file is already in this folder.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move here' })).toHaveProperty('disabled', true);

    fireEvent.click(await screen.findByText('Legal'));

    await waitFor(() =>
      expect(screen.queryByText('The file is already in this folder.')).toBeNull(),
    );
    const moveButton = screen.getByRole('button', { name: 'Move here' });
    await waitFor(() => expect(moveButton).toHaveProperty('disabled', false));
    fireEvent.click(moveButton);

    expect(await screen.findByRole('button', { name: 'Moving…' })).toHaveProperty(
      'disabled',
      true,
    );

    resolvePatch(jsonResponse({ ...file, folderId: subfolder.id }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Move file' })).toBeNull());
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Moved to "Legal"');
  });
});

describe('FilePage — deleting a file', () => {
  it('disables the button and shows a loading label while in flight, closes the dialog, toasts, and returns to the folder', async () => {
    let resolveDelete!: (response: Response) => void;
    const pendingDelete = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const fetchMock = vi.fn(async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/data-rooms') && method === 'GET') {
        return jsonResponse({ items: [room], nextCursor: null });
      }
      if (url.includes('/files/file-1') && method === 'DELETE') {
        return pendingDelete;
      }
      if (url.includes('/files/file-1') && method === 'GET') {
        return jsonResponse({ ...file, ...OWNER_FILE_FIELDS });
      }
      if (url.includes('/folders/folder-1/children') && method === 'GET') {
        return jsonResponse({ items: [], nextCursor: null });
      }
      if (url.includes('/folders/folder-1') && method === 'GET') {
        return jsonResponse({
          ...rootFolder,
          breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
          isRoot: true,
          ...OWNER_FOLDER_FIELDS,
        });
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { router } = renderRouterAt('/files/file-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');
    fireEvent.pointerDown(within(page).getByRole('button', { name: 'More actions' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByRole('heading', { name: 'Delete this file?' })).toBeTruthy();
    const deleteButton = await screen.findByRole('button', { name: 'Delete file' });
    fireEvent.click(deleteButton);

    const deletingButton = await screen.findByRole('button', { name: 'Deleting…' });
    expect(deletingButton).toHaveProperty('disabled', true);

    resolveDelete(new Response(null, { status: 204 }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/folders/folder-1'));

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
  });
});

describe('FilePage — back target one level deep', () => {
  it('labels the Back button with the containing folder\'s own name', async () => {
    stubFileApi({
      fileOverride: { ...file, folderId: subfolder.id },
      folder: subfolder,
    });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    expect(await within(page).findByRole('link', { name: /Legal/ })).toBeTruthy();
  });
});

describe('FilePage — not-yet-ready and non-PDF files', () => {
  it('shows a processing message instead of an iframe for a PENDING file, without requesting a download URL', async () => {
    const fetchMock = stubFileApi({ fileOverride: { ...file, status: 'PENDING' } });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    expect(
      await screen.findByText("This file is still being processed and can't be previewed yet."),
    ).toBeTruthy();
    expect(screen.queryByTitle('NDA.pdf')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (typeof input === 'string' ? input : input.toString()).includes('/download-url'),
      ),
    ).toBe(false);
  });

  it('shows a fallback message for a non-PDF mimeType', async () => {
    stubFileApi({ fileOverride: { ...file, mimeType: 'image/png' } });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    expect(await screen.findByText("Preview isn't available for this file type.")).toBeTruthy();
    expect(screen.queryByTitle('NDA.pdf')).toBeNull();
  });
});

describe('FilePage — errors', () => {
  it('shows an error message if the file fails to load', async () => {
    stubFileApi({ fileStatus: 500 });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "Couldn't load this file. Try refreshing the page.",
    );
  });
});

describe('FilePage — not found', () => {
  it('shows the signed-in not-found state for a 404, with a link back to the room list', async () => {
    stubFileApi({ fileStatus: 404 });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('file-page');
    expect(await within(page).findByText('This file can’t be found')).toBeTruthy();
    expect(within(page).getByText(/You are signed in as ada@example.com/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // Scoped to `page` — the sidebar's own brand link shares this accessible name (see
    // `app-topbar.tsx`).
    const link = within(page).getByRole('link', { name: 'Go to your Data Rooms' });
    expect(link.getAttribute('href')).toBe('/home');
  });

  it('shows the signed-out not-found state for a 404, with Sign in and About links', async () => {
    stubFileApi({ fileStatus: 404 });
    renderRouterAt('/files/file-1', { status: 'unauthenticated' });

    expect(await screen.findByText('This file can’t be found')).toBeTruthy();
    expect(
      screen.getByText('If it was shared with your account by email, sign in and open the link again.'),
    ).toBeTruthy();

    // Two "Sign in" buttons exist (the chrome-free `Header`'s own, plus this state's) —
    // asserting there are two is enough; `signInWithGoogle`'s own navigation isn't
    // exercised here (same reasoning as `header.tsx`'s own tests).
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(2);
    const aboutLink = screen.getByRole('link', { name: 'About Data Red Room' });
    expect(aboutLink.getAttribute('href')).toBe('/');
  });
});

describe('FilePage — recipient views (non-owner)', () => {
  const recipient: User = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'reviewer@counterparty.example',
    name: 'Sam Reviewer',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  /** Stubs `GET /files/:id` (and, only when `sharedRootType !== 'FILE'`, the containing
   * folder) as a non-owner would see it. Deliberately serves *no* `/folders/:id` handler
   * when `sharedRootType === 'FILE'` — a FILE-level share doesn't grant independent
   * access to its folder, so `file-route.tsx` must not even attempt that fetch (see
   * `needsFolderFetch`); an unstubbed request would throw "Unhandled fetch in test" and
   * fail loudly if the route regressed to fetching it anyway. */
  function stubRecipientFileApi({
    sharedRootType,
    folder = rootFolder,
    sharedWithMe = [],
  }: {
    sharedRootType: 'FILE' | 'FOLDER';
    folder?: Folder;
    /** The sidebar's "Shared with me" list — see `AppSidebar`. Defaults to empty; pass
     * an entry to assert its active state in the sidebar nav. */
    sharedWithMe?: unknown[];
  }) {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/shares/shared-with-me')) {
        return jsonResponse({ items: sharedWithMe, nextCursor: null });
      }
      if (url.includes('/files/file-1')) {
        return jsonResponse({
          ...file,
          folderId: folder.id,
          isOwner: false,
          sharedByEmail: 'legal@ashcroft-mill.com',
          sharedRootType,
        });
      }
      if (sharedRootType !== 'FILE' && url.includes(`/folders/${folder.id}`)) {
        return jsonResponse({
          ...folder,
          breadcrumbs: [{ id: folder.id, name: folder.name }],
          isRoot: folder.parentId === null,
          dataRoomName: room.name,
          isOwner: false,
          sharedByEmail: 'legal@ashcroft-mill.com',
          sharedRootType: folder.parentId === null ? 'DATA_ROOM' : 'FOLDER',
        });
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('reaches the file page signed out, instead of redirecting to "/" (the bug this fix addresses)', async () => {
    stubRecipientFileApi({ sharedRootType: 'FILE' });
    const { router } = renderRouterAt('/files/file-1', { status: 'unauthenticated' });

    expect(await screen.findByTestId('file-page')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/files/file-1');
  });

  it('FILE-level share: never fetches the containing folder, shows the "Shared file · read-only" pill, and has no Back button', async () => {
    const fetchMock = stubRecipientFileApi({ sharedRootType: 'FILE' });
    renderRouterAt('/files/file-1', { status: 'unauthenticated' });

    const page = await screen.findByTestId('file-page');
    expect(await within(page).findByText('Shared file · read-only')).toBeTruthy();
    expect(within(page).queryByRole('link', { name: /Legal|root|Project Halyard/ })).toBeNull();
    // The regression this guards: a permanently-disabled folder query must not leave the
    // page hung on its skeleton forever (see `needsFolderFetch` in `file-route.tsx`).
    expect(within(page).queryByText('NDA.pdf')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (typeof input === 'string' ? input : input.toString()).includes('/folders/'),
      ),
    ).toBe(false);
  });

  it('FILE-level share: hides Share and the kebab menu, keeps Download', async () => {
    stubRecipientFileApi({ sharedRootType: 'FILE' });
    renderRouterAt('/files/file-1', { status: 'unauthenticated' });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');
    expect(within(page).queryByRole('button', { name: 'Share' })).toBeNull();
    expect(within(page).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(within(page).getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('FOLDER-level share (file reached by browsing): fetches the containing folder and shows a working Back button', async () => {
    stubRecipientFileApi({ sharedRootType: 'FOLDER', folder: subfolder });
    const { router } = renderRouterAt('/files/file-1', { status: 'unauthenticated' });

    const page = await screen.findByTestId('file-page');
    const back = await within(page).findByRole('link', { name: /Legal/ });
    expect(within(page).queryByText('Shared file · read-only')).toBeNull();
    fireEvent.click(back);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/folders/${subfolder.id}`));
  });

  it('signed in: keeps the sidebar (AppShell) and shows the inline read-only badge', async () => {
    stubRecipientFileApi({ sharedRootType: 'FILE' });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: recipient });

    await screen.findByTestId('file-page');
    expect(await screen.findByRole('navigation', { name: 'Your Data Rooms' })).toBeTruthy();
    expect(
      screen.getAllByText('Read-only · Shared by legal@ashcroft-mill.com').length,
    ).toBeGreaterThan(0);
  });

  it('marks a FILE-type "Shared with me" sidebar entry active while viewing that file directly', async () => {
    stubRecipientFileApi({
      sharedRootType: 'FILE',
      sharedWithMe: [
        {
          resourceType: 'FILE',
          resourceId: file.id,
          name: file.name,
          role: 'VIEWER',
          sharedByEmail: 'legal@ashcroft-mill.com',
          folderId: null,
        },
      ],
    });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: file.name });
    // The "Shared with me" list loads independently of the file query that supplies
    // `activeSharedItemIds` — wait for both to settle rather than asserting the instant
    // the link first appears.
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: file.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });

  it('keeps a FILE-type "Shared with me" entry active even when a wider FOLDER-level share also applies (regression: `sharedRootType` reflects the widest share, not necessarily `\'FILE\'`)', async () => {
    // The recipient has a direct FILE share on this exact file *and* a wider FOLDER share
    // also covers its containing folder — `sharedRootType` resolves to the *wider* one
    // (`'FOLDER'`), per `AccessControlService.resolveShareContext`'s widest-candidate
    // precedence. The FILE-type entry must still highlight: matching it only ever needs
    // the file's own id, never `sharedRootType`.
    stubRecipientFileApi({
      sharedRootType: 'FOLDER',
      sharedWithMe: [
        {
          resourceType: 'FILE',
          resourceId: file.id,
          name: file.name,
          role: 'VIEWER',
          sharedByEmail: 'legal@ashcroft-mill.com',
          folderId: null,
        },
      ],
    });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: file.name });
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: file.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });

  it('marks a FOLDER-type "Shared with me" sidebar entry active while viewing a file reached by browsing it', async () => {
    stubRecipientFileApi({
      sharedRootType: 'FOLDER',
      folder: subfolder,
      sharedWithMe: [
        {
          resourceType: 'FOLDER',
          resourceId: subfolder.id,
          name: subfolder.name,
          role: 'VIEWER',
          sharedByEmail: 'legal@ashcroft-mill.com',
          folderId: subfolder.id,
        },
      ],
    });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: subfolder.name });
    // Same reasoning as the FILE-type test above, plus a second async hop here: the
    // containing folder's own query has to resolve before `activeSharedItemIds` is set.
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: subfolder.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });
});
