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
}: {
  children?: unknown[];
  folderStatus?: number;
  /** Return a status other than 201 (e.g. 409) for a specific submitted name. */
  onCreate?: (name: string) => number;
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
    if (url.includes('/folders/folder-1/children') && method === 'GET') {
      return jsonResponse({ items: children, nextCursor: null });
    }
    if (url.includes('/folders/folder-1') && method === 'GET') {
      if (folderStatus !== 200) return jsonResponse({ message: 'Not found.' }, folderStatus);
      return jsonResponse({ ...rootFolder, breadcrumbs: [], isRoot: true });
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
  it('shows the empty-state copy, with Upload/Share left inert', async () => {
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
    const shareButton = within(page).getByRole('button', { name: 'Share' });

    for (const button of [...uploadButtons, shareButton]) {
      fireEvent.click(button);
    }

    // Still on the same page, no dialog opened — the actions are genuinely inert.
    expect(router.state.location.pathname).toBe('/folders/folder-1');
    expect(screen.queryByRole('dialog')).toBeNull();
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
    stubFolderApi({ folderStatus: 404 });
    renderRouterAt('/folders/folder-1', { status: 'authenticated', user: mockUser });

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "Couldn't load this folder. Try refreshing the page.",
    );
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
          return jsonResponse({ ...rootFolder, breadcrumbs: [], isRoot: true });
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

  it('leaves every row quick action inert', async () => {
    stubFolderApi({ children: folderChildren });
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    await screen.findByText('02 Financials');
    // Radix opens `DropdownMenuTrigger` on pointerdown, not click — see
    // libs/ui/src/components/ui/dropdown-menu/dropdown-menu.spec.tsx for the same note.
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for 02 Financials' }),
      { button: 0 },
    );

    const openItem = await screen.findByRole('menuitem', { name: 'Open' });
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Move' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Download' })).toBeNull();

    fireEvent.click(openItem);
    expect(router.state.location.pathname).toBe('/folders/folder-1');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for 02 Financials' }),
      { button: 0 },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for 02 Financials' }),
      { button: 0 },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Share' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for 02 Financials' }),
      { button: 0 },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/folders/folder-1');
  });
});
