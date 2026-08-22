import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { DataRoomListItem, Folder, User } from '@dataroom/contracts';

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

const otherRoom: DataRoomListItem = {
  id: 'room-2',
  name: 'Project Anchorage',
  ownerId: mockUser.id,
  rootFolderId: 'folder-2',
  createdAt: '2026-01-06T00:00:00.000Z',
  updatedAt: '2026-01-06T00:00:00.000Z',
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The access-context fields every `GET /folders/:id` response now carries (see
 * `libs/contracts/src/lib/folders.ts`) — every scenario in this file is `mockUser`
 * browsing their own room as its owner, so these are identical everywhere. */
const OWNER_FOLDER_FIELDS = {
  dataRoomName: room.name,
  isOwner: true,
  sharedByEmail: null,
  sharedRootType: null,
} as const;

/**
 * `FolderPage` calls `useFolderQuery`, `useFolderChildrenQuery`, and (via `AppSidebar`/
 * for the room-name lookup) `useDataRoomsQuery` — three real `fetch`es, same "no MSW"
 * reasoning as `stubDataRoomsApi` in `home-route.spec.tsx`. Also handles `POST /folders`
 * for the "New folder" dialog, mirroring that same file's POST handling.
 */
function stubFolderApi({
  children = [],
  folderStatus = 200,
  onCreate,
  onUpdate,
  onDelete,
  stats,
}: {
  children?: unknown[];
  folderStatus?: number;
  /** Return a status other than 201 (e.g. 409) for a specific submitted name. */
  onCreate?: (name: string) => number;
  /** Return a status other than 200 (e.g. 409) for a specific renamed-to name. */
  onUpdate?: (name: string) => number;
  /** Return a status other than 200 for a delete. */
  onDelete?: () => number;
  /** Body for any `GET /folders/:id/stats` call — defaults to an empty subtree. */
  stats?: { totalSize: string; fileCount: number; folderCount: number };
} = {}) {
  let nextId = 1;
  const fetchMock = vi.fn(async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/data-rooms') && method === 'GET') {
      return jsonResponse({ items: [room, otherRoom], nextCursor: null });
    }
    if (url.includes('/folders') && method === 'POST') {
      const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
        dataRoomId: string;
        parentId: string;
        name: string;
      };
      const status = onCreate ? onCreate(body.name) : 201;
      if (status !== 201) {
        return jsonResponse(
          { message: `A folder named "${body.name}" already exists here.` },
          status,
        );
      }
      const folder: Folder = {
        id: `generated-${nextId++}`,
        name: body.name,
        dataRoomId: body.dataRoomId,
        parentId: body.parentId,
        path: `/folder-1/generated-${nextId}/`,
        depth: 1,
        createdAt: '2026-01-07T00:00:00.000Z',
        updatedAt: '2026-01-07T00:00:00.000Z',
      };
      return jsonResponse(folder, 201);
    }
    const statsMatch = /\/folders\/([\w-]+)\/stats$/.exec(url);
    if (statsMatch && method === 'GET') {
      return jsonResponse(stats ?? { totalSize: '0', fileCount: 0, folderCount: 0 });
    }
    // `ShareDialog` (opened from `FolderToolbar`'s or a row's "Share" action) always
    // queries the resource's current shares — no test here exercises granting/revoking,
    // so this is just enough to let the dialog render without an "unhandled fetch" throw.
    if (url.includes('/shares') && method === 'GET') {
      return jsonResponse({ items: [], nextCursor: null });
    }
    const singleFolderMatch = /\/folders\/([\w-]+)$/.exec(url);
    if (singleFolderMatch && method === 'PATCH') {
      const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { name: string };
      const status = onUpdate ? onUpdate(body.name) : 200;
      if (status !== 200) {
        return jsonResponse(
          { message: `A folder named "${body.name}" already exists here.` },
          status,
        );
      }
      const folder: Folder = {
        id: singleFolderMatch[1],
        name: body.name,
        dataRoomId: room.id,
        parentId: rootFolder.id,
        path: `/folder-1/${singleFolderMatch[1]}/`,
        depth: 1,
        createdAt: '2026-01-06T00:00:00.000Z',
        updatedAt: '2026-01-09T00:00:00.000Z',
      };
      return jsonResponse(folder);
    }
    if (singleFolderMatch && method === 'DELETE') {
      const status = onDelete ? onDelete() : 200;
      if (status !== 200) return jsonResponse({ message: 'Not found.' }, status);
      return jsonResponse({ success: true });
    }
    if (url.includes('/folders/folder-1/children') && method === 'GET') {
      return jsonResponse({ items: children, nextCursor: null });
    }
    if (url.includes('/folders/folder-1') && method === 'GET') {
      if (folderStatus !== 200) return jsonResponse({ message: 'Not found.' }, folderStatus);
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
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FolderPage — root, empty', () => {
  it('shows the empty-state copy, with Upload left inert and Share opening ShareDialog', async () => {
    stubFolderApi();
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('folder-page');
    expect(await within(page).findByText('Nothing in Project Halyard yet')).toBeTruthy();
    expect(within(page).getAllByText('Project Halyard').length).toBeGreaterThan(0);

    const uploadButtons = within(page).getAllByRole('button', {
      name: /^Upload( PDFs)?$/,
    });
    for (const button of uploadButtons) {
      fireEvent.click(button);
    }

    // Still on the same page, no dialog opened — Upload triggers the native file picker,
    // not a modal (see `upload-button.tsx`), so it's genuinely inert here.
    expect(router.state.location.pathname).toBe('/folders/folder-1');
    expect(screen.queryByRole('dialog')).toBeNull();

    // The root folder is the Data Room itself — Share targets the room, not the folder
    // (see `folder-toolbar.tsx`'s `isRoot` handling).
    fireEvent.click(within(page).getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Share Data Room')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Project Halyard' })).toBeTruthy();
  });

  it('sets the document title to the room name (root folder) once loaded', async () => {
    stubFolderApi();
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    await waitFor(() => expect(document.title).toBe('Project Halyard — Data Red Rooms'));
  });

  it('opens the New folder dialog from either "New folder" action', async () => {
    stubFolderApi();
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const [firstButton, ...rest] = await screen.findAllByRole('button', { name: 'New folder' });
    expect(rest).toHaveLength(1); // one in the toolbar, one in the empty state

    fireEvent.click(firstButton);
    expect(await screen.findByRole('heading', { name: 'New folder' })).toBeTruthy();
    expect(
      screen.getByText('Created inside Project Halyard.'),
    ).toBeTruthy();
    // Opening the dialog is not navigation.
    expect(router.state.location.pathname).toBe('/folders/folder-1');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New folder' })).toBeNull(),
    );

    fireEvent.click(rest[0]);
    expect(await screen.findByRole('heading', { name: 'New folder' })).toBeTruthy();
  });

  it('marks the current room active in the sidebar nav, and no other room', async () => {
    stubFolderApi();
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    const current = await within(nav).findByRole('link', { name: /Project Halyard/ });
    const other = within(nav).getByRole('link', { name: /Project Anchorage/ });

    expect(current).toHaveProperty('ariaCurrent', 'page');
    expect(other.getAttribute('aria-current')).toBeNull();
  });

  it('shows an error message if the folder fails to load', async () => {
    stubFolderApi({ folderStatus: 500 });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "Couldn't load this folder. Try refreshing the page.",
    );
  });
});

describe('FolderPage — not found', () => {
  it('shows the signed-in not-found state for a 404, with a link back to the room list', async () => {
    stubFolderApi({ folderStatus: 404 });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('folder-page');
    expect(await within(page).findByText('This folder can’t be found')).toBeTruthy();
    expect(within(page).getByText(/You are signed in as ada@example.com/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // Scoped to `page` — the sidebar's own brand link shares this accessible name (see
    // `app-topbar.tsx`).
    const link = within(page).getByRole('link', { name: 'Go to your Data Rooms' });
    expect(link.getAttribute('href')).toBe('/home');
  });

  it('shows the signed-out not-found state for a 404, with Sign in and About links', async () => {
    stubFolderApi({ folderStatus: 404 });
    renderRouterAt('/folders/folder-1', { status: 'unauthenticated' });

    expect(await screen.findByText('This folder can’t be found')).toBeTruthy();
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

describe('FolderPage — creating a folder', () => {
  it('disables the Create button and shows a loading label while the request is in flight, then closes the dialog', async () => {
    let resolvePost!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => {
      resolvePost = resolve;
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
          return jsonResponse({ items: [room, otherRoom], nextCursor: null });
        }
        if (url.includes('/folders') && method === 'POST') {
          return pendingPost;
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
      }),
    );

    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    fireEvent.click((await screen.findAllByRole('button', { name: 'New folder' }))[0]);

    const nameInput = await screen.findByLabelText('Folder name');
    fireEvent.change(nameInput, { target: { value: '02 Financials' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    const submitButton = await screen.findByRole('button', { name: 'Creating…' });
    expect(submitButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);

    resolvePost(
      jsonResponse(
        {
          id: 'generated-1',
          name: '02 Financials',
          dataRoomId: room.id,
          parentId: rootFolder.id,
          path: '/folder-1/generated-1/',
          depth: 1,
          createdAt: '2026-01-07T00:00:00.000Z',
          updatedAt: '2026-01-07T00:00:00.000Z',
        },
        201,
      ),
    );

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New folder' })).toBeNull(),
    );
  });

  it('shows the 409 conflict message inline and keeps the dialog open', async () => {
    stubFolderApi({ onCreate: () => 409 });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    fireEvent.click((await screen.findAllByRole('button', { name: 'New folder' }))[0]);
    const nameInput = await screen.findByLabelText('Folder name');
    fireEvent.change(nameInput, { target: { value: '02 Financials' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'A folder named "02 Financials" already exists here.',
    );
    expect(screen.getByRole('heading', { name: 'New folder' })).toBeTruthy();
  });
});

describe('FolderPage — root, populated', () => {
  const folderChildren = [
    {
      kind: 'folder',
      id: 'folder-child-1',
      name: '02 Financials',
      createdAt: '2026-01-06T00:00:00.000Z',
      updatedAt: '2026-01-08T00:00:00.000Z',
    },
  ];

  it('renders a table row per child, with Size "—" and a formatted Modified date', async () => {
    stubFolderApi({ children: folderChildren });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('folder-page');
    expect(await within(page).findByText('02 Financials')).toBeTruthy();
    expect(within(page).getByText('—')).toBeTruthy();
    expect(within(page).getByText('Jan 8, 2026')).toBeTruthy();
    expect(within(page).queryByText("This folder isn't empty")).toBeNull();
  });

  it("navigates into a subfolder when its row's name is clicked", async () => {
    stubFolderApi({ children: folderChildren });
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('folder-page');
    fireEvent.click(await within(page).findByText('02 Financials'));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/folders/folder-child-1'),
    );
  });

  function openRowMenu(name: string) {
    // Radix opens `DropdownMenuTrigger` on pointerdown, not click — see
    // libs/ui/src/components/ui/dropdown-menu/dropdown-menu.spec.tsx for the same note.
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${name}` }), {
      button: 0,
    });
  }

  it('lists all four row menu items, and Share opens ShareDialog for that row', async () => {
    stubFolderApi({ children: folderChildren });
    renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');

    expect(await screen.findByRole('menuitem', { name: 'Open' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Move' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Download' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Share folder')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '02 Financials' })).toBeTruthy();
  });

  it('navigates into the folder when "Open" is chosen from its row menu', async () => {
    stubFolderApi({ children: folderChildren });
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/folders/folder-child-1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('FolderPage — renaming a folder', () => {
  const folderChildren = [
    {
      kind: 'folder',
      id: 'folder-child-1',
      name: '02 Financials',
      createdAt: '2026-01-06T00:00:00.000Z',
      updatedAt: '2026-01-08T00:00:00.000Z',
    },
  ];

  function openRowMenu(name: string) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${name}` }), {
      button: 0,
    });
  }

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
          return jsonResponse({ items: [room, otherRoom], nextCursor: null });
        }
        if (url.includes('/folders/folder-child-1') && method === 'PATCH') {
          return pendingPatch;
        }
        if (url.includes('/folders/folder-1/children') && method === 'GET') {
          return jsonResponse({ items: folderChildren, nextCursor: null });
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

    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const nameInput = await screen.findByLabelText('Folder name');
    expect(nameInput).toHaveProperty('value', '02 Financials');
    fireEvent.change(nameInput, { target: { value: '02 Financials (renamed)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const savingButton = await screen.findByRole('button', { name: 'Saving…' });
    expect(savingButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);

    resolvePatch(
      jsonResponse({
        id: 'folder-child-1',
        name: '02 Financials (renamed)',
        dataRoomId: room.id,
        parentId: rootFolder.id,
        path: '/folder-1/folder-child-1/',
        depth: 1,
        createdAt: '2026-01-06T00:00:00.000Z',
        updatedAt: '2026-01-09T00:00:00.000Z',
      }),
    );

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Rename folder' })).toBeNull());
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Renamed to "02 Financials (renamed)"',
    );
  });

  it('shows the 409 conflict message inline and keeps the dialog open', async () => {
    stubFolderApi({ children: folderChildren, onUpdate: () => 409 });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const nameInput = await screen.findByLabelText('Folder name');
    fireEvent.change(nameInput, { target: { value: '01 Legal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'A folder named "01 Legal" already exists here.',
    );
    expect(screen.getByRole('heading', { name: 'Rename folder' })).toBeTruthy();
  });
});

describe('FolderPage — deleting a folder', () => {
  const folderChildren = [
    {
      kind: 'folder',
      id: 'folder-child-1',
      name: '02 Financials',
      createdAt: '2026-01-06T00:00:00.000Z',
      updatedAt: '2026-01-08T00:00:00.000Z',
    },
  ];

  function openRowMenu(name: string) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${name}` }), {
      button: 0,
    });
  }

  it('shows live stats once loaded, disables the button and shows a loading label while in flight, closes the dialog, and toasts on success', async () => {
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
        return jsonResponse({ items: [room, otherRoom], nextCursor: null });
      }
      if (url.includes('/folders/folder-child-1/stats') && method === 'GET') {
        // `folderCount` includes the target folder's own row (see `FoldersService.stats`),
        // so this is "1 real subfolder" — 2, not 1.
        return jsonResponse({ totalSize: '2097152', fileCount: 3, folderCount: 2 });
      }
      if (url.includes('/folders/folder-child-1') && method === 'DELETE') {
        return pendingDelete;
      }
      if (url.includes('/folders/folder-1/children') && method === 'GET') {
        return jsonResponse({ items: folderChildren, nextCursor: null });
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

    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(
      await screen.findByRole('heading', { name: 'Delete "02 Financials" and everything inside it?' }),
    ).toBeTruthy();
    const deleteButton = await screen.findByRole('button', { name: 'Delete folder and 4 items' });

    fireEvent.click(deleteButton);
    const deletingButton = await screen.findByRole('button', { name: 'Deleting…' });
    expect(deletingButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Keep folder' })).toHaveProperty('disabled', true);

    resolveDelete(jsonResponse({ success: true }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Delete "02 Financials" and everything inside it?' }),
      ).toBeNull(),
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      '"02 Financials" deleted permanently',
    );

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
  });

  it('shows skeletons in place of the stats and disables the delete button while stats are still loading', async () => {
    let resolveStats!: (response: Response) => void;
    const pendingStats = new Promise<Response>((resolve) => {
      resolveStats = resolve;
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
          return jsonResponse({ items: [room, otherRoom], nextCursor: null });
        }
        if (url.includes('/folders/folder-child-1/stats') && method === 'GET') {
          return pendingStats;
        }
        if (url.includes('/folders/folder-1/children') && method === 'GET') {
          return jsonResponse({ items: folderChildren, nextCursor: null });
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

    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    // The count is still unknown, so the button reads the plain, generic label — no "and
    // N items" jump once the count resolves — and can't be clicked yet.
    const deleteButton = await screen.findByRole('button', { name: 'Delete folder' });
    expect(deleteButton).toHaveProperty('disabled', true);

    // Every stat cell shows a skeleton rather than a value or a dash.
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    expect(screen.queryByText('0')).toBeNull();

    resolveStats(jsonResponse({ totalSize: '0', fileCount: 0, folderCount: 1 }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete folder and 0 items' })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });

  it('shows zero subfolders for an empty folder, not the target folder\'s own row', async () => {
    // `folderCount` from the API always includes the target folder itself (see
    // `FoldersService.stats`) — for a folder with no real subfolders, that's 1, and the
    // dialog must not show that as "Subfolders deleted: 1".
    stubFolderApi({
      children: folderChildren,
      stats: { totalSize: '0', fileCount: 0, folderCount: 1 },
    });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    await screen.findByText('02 Financials');
    openRowMenu('02 Financials');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    await screen.findByRole('button', { name: 'Delete folder and 0 items' });
    const stats = screen.getByText('Subfolders deleted').nextElementSibling;
    expect(stats).toHaveProperty('textContent', '0');
  });
});

describe('FolderPage — breadcrumb navigation', () => {
  // root(folder-1, "/") -> Legal(folder-2) -> Contracts(folder-3) -> Drafts(folder-4) ->
  // 2024(folder-5) — a chain deep enough (5 folders including root) to exercise both the
  // uncollapsed and the collapsed ("…") breadcrumb rendering.
  const legal: Folder = {
    id: 'folder-2',
    name: 'Legal',
    dataRoomId: room.id,
    parentId: rootFolder.id,
    path: '/folder-1/folder-2/',
    depth: 1,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  };
  const contractsFolder: Folder = {
    id: 'folder-3',
    name: 'Contracts',
    dataRoomId: room.id,
    parentId: legal.id,
    path: '/folder-1/folder-2/folder-3/',
    depth: 2,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  };
  const drafts: Folder = {
    id: 'folder-4',
    name: 'Drafts',
    dataRoomId: room.id,
    parentId: contractsFolder.id,
    path: '/folder-1/folder-2/folder-3/folder-4/',
    depth: 3,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  };
  const year2024: Folder = {
    id: 'folder-5',
    name: '2024',
    dataRoomId: room.id,
    parentId: drafts.id,
    path: '/folder-1/folder-2/folder-3/folder-4/folder-5/',
    depth: 4,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  };
  const allFolders = [rootFolder, legal, contractsFolder, drafts, year2024];

  function ancestorsOf(folder: Folder) {
    const chain: Folder[] = [];
    let current: Folder | undefined = folder;
    while (current) {
      chain.unshift(current);
      const parentId: string | null = current.parentId;
      current = parentId ? allFolders.find((f) => f.id === parentId) : undefined;
    }
    return chain;
  }

  /** Serves `GET /folders/:id` and `/children` for every folder in `allFolders`, computing
   * `breadcrumbs`/`isRoot` the same way the real API does (see
   * `apps/api/src/folders/folders.service.ts#get`) — root-first, current folder included last. */
  function stubFolderTreeApi() {
    const fetchMock = vi.fn(async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/data-rooms') && method === 'GET') {
        return jsonResponse({ items: [room, otherRoom], nextCursor: null });
      }
      const childrenMatch = /\/folders\/([\w-]+)\/children/.exec(url);
      if (childrenMatch && method === 'GET') {
        return jsonResponse({ items: [], nextCursor: null });
      }
      const folderMatch = /\/folders\/([\w-]+)$/.exec(url);
      if (folderMatch && method === 'GET') {
        const folder = allFolders.find((f) => f.id === folderMatch[1]);
        if (!folder) return jsonResponse({ message: 'Not found.' }, 404);
        const breadcrumbs = ancestorsOf(folder).map((f) => ({ id: f.id, name: f.name }));
        return jsonResponse({
          ...folder,
          breadcrumbs,
          isRoot: folder.parentId === null,
          ...OWNER_FOLDER_FIELDS,
        });
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('"Data Rooms" links back to /home', async () => {
    stubFolderTreeApi();
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('folder-page');
    const nav = await within(page).findByRole('navigation', { name: 'Breadcrumb' });
    fireEvent.click(within(nav).getByText('Data Rooms'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it('shows the full chain for a folder two levels deep, with only the current folder non-interactive', async () => {
    stubFolderTreeApi();
    renderRouterAt('/folders/folder-3', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('folder-page');
    const nav = await within(page).findByRole('navigation', { name: 'Breadcrumb' });

    expect(within(nav).getByText('Data Rooms')).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Project Halyard' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Legal' })).toBeTruthy();
    const current = within(nav).getByText('Contracts');
    expect(current).toHaveProperty('ariaCurrent', 'page');
    expect(within(nav).queryByRole('link', { name: 'Contracts' })).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Show hidden folders' })).toBeNull();

    // The page title mirrors the current folder, not the room.
    expect(within(page).getByRole('heading', { name: 'Contracts' })).toBeTruthy();
  });

  it("keeps the owning room active in the sidebar nav while browsing its subfolders", async () => {
    stubFolderTreeApi();
    renderRouterAt('/folders/folder-3', { status: 'authenticated', user: mockUser });

    await screen.findByTestId('folder-page');
    const sidebarNav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    const current = within(sidebarNav).getByRole('link', { name: /Project Halyard/ });
    const other = within(sidebarNav).getByRole('link', { name: /Project Anchorage/ });

    expect(current).toHaveProperty('ariaCurrent', 'page');
    expect(other.getAttribute('aria-current')).toBeNull();
  });

  it('collapses a 5-folder-deep chain behind "…", and jumps to a hidden folder from its dropdown', async () => {
    stubFolderTreeApi();
    const { router } = renderRouterAt('/folders/folder-5', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('folder-page');
    const nav = await within(page).findByRole('navigation', { name: 'Breadcrumb' });

    // Visible: Data Rooms, Project Halyard, …, Drafts, 2024 (current) — Legal and Contracts
    // are hidden behind the ellipsis.
    expect(within(nav).getByRole('link', { name: 'Project Halyard' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Drafts' })).toBeTruthy();
    expect(within(nav).getByText('2024')).toHaveProperty('ariaCurrent', 'page');
    expect(within(nav).queryByRole('link', { name: 'Legal' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Contracts' })).toBeNull();

    const ellipsis = within(nav).getByRole('button', { name: 'Show hidden folders' });
    // Radix opens `DropdownMenuTrigger` on pointerdown, not click — see the kebab-menu
    // tests above for the same note.
    fireEvent.pointerDown(ellipsis, { button: 0 });

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Legal' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/folders/folder-2'));
  });

  describe('FolderPage — subfolder, empty', () => {
    it('shows the "This folder is empty" state (not the Data Room empty state), with Upload left inert', async () => {
      stubFolderTreeApi();
      const { router } = renderRouterAt('/folders/folder-2', {
        status: 'authenticated',
        user: mockUser,
      });

      const page = await screen.findByTestId('folder-page');
      expect(await within(page).findByText('This folder is empty')).toBeTruthy();
      expect(within(page).queryByText(/^Nothing in .* yet$/)).toBeNull();

      fireEvent.click(within(page).getByRole('button', { name: 'Upload PDFs' }));

      // Upload is inert — still on the same page, no dialog opened.
      expect(router.state.location.pathname).toBe('/folders/folder-2');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens the New folder dialog from its "New folder" action', async () => {
      stubFolderTreeApi();
      renderRouterAt('/folders/folder-2', { status: 'authenticated', user: mockUser });

      const page = await screen.findByTestId('folder-page');
      await within(page).findByText('This folder is empty');
      // Two "New folder" buttons on screen — one in the toolbar, one in the empty state.
      const [, emptyStateButton] = within(page).getAllByRole('button', { name: 'New folder' });
      fireEvent.click(emptyStateButton);

      expect(await screen.findByRole('heading', { name: 'New folder' })).toBeTruthy();
    });
  });
});

describe('FolderPage — recipient views (non-owner)', () => {
  // A different user than `mockUser` (the room's owner) — irrelevant to the
  // signed-out cases, but stands in for "the share recipient" in the signed-in ones.
  const recipient: User = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'reviewer@counterparty.example',
    name: 'Sam Reviewer',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const legal: Folder = {
    id: 'folder-2',
    name: 'Legal',
    dataRoomId: room.id,
    parentId: rootFolder.id,
    path: '/folder-1/folder-2/',
    depth: 1,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  };

  /** Stubs `GET /folders/:id` as a non-owner would see it — `isOwner: false` plus the
   * share-attribution fields `FoldersService.get` now computes, per `sharedRootType`.
   * Deliberately does *not* stub `/data-rooms` — a non-owner (share recipient) view no
   * longer calls it at all (see `folder-route.tsx`'s `roomName`), so an accidental call
   * would fail loudly here instead of silently reusing an owner-only endpoint. */
  function stubRecipientFolderApi({
    folder = legal,
    breadcrumbs,
    sharedRootType,
    children = [],
    sharedWithMe = [],
  }: {
    folder?: Folder;
    breadcrumbs: { id: string; name: string }[];
    sharedRootType: 'DATA_ROOM' | 'FOLDER';
    children?: unknown[];
    /** The sidebar's "Shared with me" list — see `AppSidebar`. Defaults to empty; pass
     * an entry to assert its active state in the sidebar nav. */
    sharedWithMe?: unknown[];
  }) {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/shares/shared-with-me')) {
        return jsonResponse({ items: sharedWithMe, nextCursor: null });
      }
      if (url.includes(`/folders/${folder.id}/children`)) {
        return jsonResponse({ items: children, nextCursor: null });
      }
      if (url.includes(`/folders/${folder.id}`)) {
        return jsonResponse({
          ...folder,
          breadcrumbs,
          isRoot: folder.parentId === null,
          dataRoomName: room.name,
          isOwner: false,
          sharedByEmail: 'legal@ashcroft-mill.com',
          sharedRootType,
        });
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('reaches the folder page signed out, instead of redirecting to "/" (the bug this fix addresses)', async () => {
    stubRecipientFolderApi({
      breadcrumbs: [{ id: legal.id, name: legal.name }],
      sharedRootType: 'FOLDER',
    });
    const { router } = renderRouterAt('/folders/folder-2', { status: 'unauthenticated' });

    expect(await screen.findByTestId('folder-page')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/folders/folder-2');
  });

  it('signed out: shows the chrome-free header with the read-only badge and a Sign in button, no sidebar', async () => {
    stubRecipientFolderApi({
      breadcrumbs: [{ id: legal.id, name: legal.name }],
      sharedRootType: 'FOLDER',
    });
    renderRouterAt('/folders/folder-2', { status: 'unauthenticated' });

    await screen.findByTestId('folder-page');
    expect(screen.queryByRole('navigation', { name: 'Your Data Rooms' })).toBeNull();
    // Badge text lives in `Header`, a sibling of the `folder-page` div, not inside it.
    expect(
      await screen.findByText('Read-only · Shared by legal@ashcroft-mill.com'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('signed out: hides every mutation control (New folder, Upload, Share; folder rows lose their kebab entirely, file rows keep only View/Download)', async () => {
    stubRecipientFolderApi({
      breadcrumbs: [{ id: legal.id, name: legal.name }],
      sharedRootType: 'FOLDER',
      children: [
        {
          kind: 'folder',
          id: 'folder-3',
          name: 'Contracts',
          createdAt: '2026-01-06T00:00:00.000Z',
          updatedAt: '2026-01-06T00:00:00.000Z',
        },
        {
          kind: 'file',
          id: 'file-1',
          name: 'NDA.pdf',
          size: '2048',
          mimeType: 'application/pdf',
          createdAt: '2026-01-06T00:00:00.000Z',
          updatedAt: '2026-01-06T00:00:00.000Z',
        },
      ],
    });
    renderRouterAt('/folders/folder-2', { status: 'unauthenticated' });

    const page = await screen.findByTestId('folder-page');
    await within(page).findByText('NDA.pdf');
    expect(within(page).queryByRole('button', { name: 'New folder' })).toBeNull();
    expect(within(page).queryByRole('button', { name: /^Upload/ })).toBeNull();
    expect(within(page).queryByRole('button', { name: 'Share' })).toBeNull();
    // The folder row's kebab is gone entirely — nothing left in it but "Open," which is
    // redundant with the row's own name link (see `FolderChildrenTable`).
    expect(within(page).queryByRole('button', { name: 'More actions for Contracts' })).toBeNull();
    // The file row keeps its kebab, but only View/Download — no Rename/Move/Share/Delete.
    fireEvent.pointerDown(within(page).getByRole('button', { name: 'More actions for NDA.pdf' }), {
      button: 0,
    });
    expect(await screen.findByRole('menuitem', { name: 'View' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Move' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
  });

  it('signed out, Data-Room-level share (viewing the room root): breadcrumb pill reads "Shared Data Room"', async () => {
    stubRecipientFolderApi({
      folder: rootFolder,
      breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
      sharedRootType: 'DATA_ROOM',
    });
    renderRouterAt('/folders/folder-1', { status: 'unauthenticated' });

    const page = await screen.findByTestId('folder-page');
    const nav = await within(page).findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByText('Shared Data Room')).toBeTruthy();
    // The root folder's stored '/' placeholder is swapped for the real room name, same
    // as the owner's own view — a DATA_ROOM-level share's root genuinely is the room root.
    expect(within(nav).getByText('Project Halyard')).toBeTruthy();
  });

  it('signed in: keeps the sidebar (AppShell), shows the inline badge, and prepends a "Shared with me" crumb', async () => {
    stubRecipientFolderApi({
      breadcrumbs: [{ id: legal.id, name: legal.name }],
      sharedRootType: 'FOLDER',
    });
    renderRouterAt('/folders/folder-2', { status: 'authenticated', user: recipient });

    const page = await screen.findByTestId('folder-page');
    expect(await screen.findByRole('navigation', { name: 'Your Data Rooms' })).toBeTruthy();
    const nav = await within(page).findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Shared with me' })).toBeTruthy();
    expect(within(nav).getByText('Shared folder')).toBeTruthy();
    // A real folder name at the truncated root must not be overwritten with the room
    // name (see `FolderBreadcrumbs`'s `rootIsDataRoom` — this is the load-bearing case).
    expect(within(nav).getByText('Legal')).toHaveProperty('ariaCurrent', 'page');
    // Two badge instances exist in the DOM (AppTopbar's narrow one, FolderToolbar's wide
    // one) — CSS breakpoints pick one per real viewport, but jsdom renders both.
    expect(
      screen.getAllByText('Read-only · Shared by legal@ashcroft-mill.com').length,
    ).toBeGreaterThan(0);
  });

  it('signed in: hides every mutation control, same as signed out', async () => {
    stubRecipientFolderApi({
      breadcrumbs: [{ id: legal.id, name: legal.name }],
      sharedRootType: 'FOLDER',
    });
    renderRouterAt('/folders/folder-2', { status: 'authenticated', user: recipient });

    const page = await screen.findByTestId('folder-page');
    await within(page).findByText('This folder is empty');
    expect(within(page).queryByRole('button', { name: 'New folder' })).toBeNull();
    expect(within(page).queryByRole('button', { name: /^Upload/ })).toBeNull();
    expect(within(page).queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('marks a FOLDER-type "Shared with me" sidebar entry active at its own root', async () => {
    const sharedWithMe = [
      {
        resourceType: 'FOLDER',
        resourceId: legal.id,
        name: legal.name,
        role: 'VIEWER',
        sharedByEmail: 'legal@ashcroft-mill.com',
        folderId: legal.id,
      },
    ];
    // Breadcrumbs is just the folder itself (self-last, per `FoldersService.get`) when
    // standing exactly on the shared root.
    stubRecipientFolderApi({
      breadcrumbs: [{ id: legal.id, name: legal.name }],
      sharedRootType: 'FOLDER',
      sharedWithMe,
    });
    renderRouterAt('/folders/folder-2', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: legal.name });
    // The "Shared with me" list loads independently of the folder query that supplies
    // `activeSharedItemId` — wait for both to settle rather than asserting the instant
    // the link first appears.
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: legal.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });

  it('keeps a FOLDER-type "Shared with me" sidebar entry active several levels into its subtree', async () => {
    const sharedWithMe = [
      {
        resourceType: 'FOLDER',
        resourceId: legal.id,
        name: legal.name,
        role: 'VIEWER',
        sharedByEmail: 'legal@ashcroft-mill.com',
        folderId: legal.id,
      },
    ];
    const subfolder: Folder = {
      id: 'folder-3',
      name: 'Contracts',
      dataRoomId: room.id,
      parentId: legal.id,
      path: '/folder-1/folder-2/folder-3/',
      depth: 2,
      createdAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
    };
    // Breadcrumbs is truncated to start at the shared root, but still starts with its id.
    stubRecipientFolderApi({
      folder: subfolder,
      breadcrumbs: [
        { id: legal.id, name: legal.name },
        { id: subfolder.id, name: subfolder.name },
      ],
      sharedRootType: 'FOLDER',
      sharedWithMe,
    });
    renderRouterAt('/folders/folder-3', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: legal.name });
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: legal.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });

  it('marks a DATA_ROOM-type "Shared with me" sidebar entry active at the room root and at depth', async () => {
    const sharedWithMe = [
      {
        resourceType: 'DATA_ROOM',
        resourceId: room.id,
        name: room.name,
        role: 'VIEWER',
        sharedByEmail: 'legal@ashcroft-mill.com',
        folderId: rootFolder.id,
      },
    ];
    stubRecipientFolderApi({
      folder: legal,
      breadcrumbs: [
        { id: rootFolder.id, name: rootFolder.name },
        { id: legal.id, name: legal.name },
      ],
      sharedRootType: 'DATA_ROOM',
      sharedWithMe,
    });
    renderRouterAt('/folders/folder-2', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: room.name });
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: room.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });

  it('keeps a FOLDER-type "Shared with me" entry active even when a wider DATA_ROOM-level share also applies (regression: `resolveShareContext` reports the widest share, not the one "Shared with me" lists)', async () => {
    // The recipient has a direct FOLDER share on `legal` *and* a wider DATA_ROOM share
    // also covers the room (e.g. a PUBLIC link) — `sharedRootType` resolves to the
    // *wider* one (`'DATA_ROOM'`), per `AccessControlService.resolveShareContext`'s
    // widest-candidate precedence. Breadcrumbs are therefore left untruncated (no `if
    // (sharedRootType === 'FOLDER')` truncation fires), so `legal`'s id still appears
    // inside the array even though it isn't `breadcrumbs[0]`.
    const sharedWithMe = [
      {
        resourceType: 'FOLDER',
        resourceId: legal.id,
        name: legal.name,
        role: 'VIEWER',
        sharedByEmail: 'legal@ashcroft-mill.com',
        folderId: legal.id,
      },
    ];
    stubRecipientFolderApi({
      breadcrumbs: [
        { id: rootFolder.id, name: rootFolder.name },
        { id: legal.id, name: legal.name },
      ],
      sharedRootType: 'DATA_ROOM',
      sharedWithMe,
    });
    renderRouterAt('/folders/folder-2', { status: 'authenticated', user: recipient });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    await within(nav).findByRole('link', { name: legal.name });
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: legal.name })).toHaveProperty(
        'ariaCurrent',
        'page',
      );
    });
  });
});
