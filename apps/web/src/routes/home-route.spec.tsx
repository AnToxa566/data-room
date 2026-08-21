import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { DataRoom, DataRoomListItem, User } from '@dataroom/contracts';

import { renderRouterAt } from '../test/render-app';

const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * `AppSidebar` and the Home route both call `useDataRoomsQuery()` (see lib/data-rooms.ts)
 * — a real `fetch`, since there's no MSW/mocking library in this repo yet. Every test that
 * renders `/home` needs `GET /data-rooms` handled, or the query errors and the route falls
 * into its error branch instead of whatever state the test means to exercise.
 */
function stubDataRoomsApi(initialRooms: DataRoomListItem[] = []) {
  const rooms = [...initialRooms];
  let nextId = 1;
  const fetchMock = vi.fn(async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const idMatch = /\/data-rooms\/([^/?]+)/.exec(url);

    if (url.includes('/data-rooms') && method === 'GET' && !idMatch) {
      return jsonResponse({ items: rooms, nextCursor: null });
    }
    if (url.includes('/data-rooms') && method === 'POST') {
      const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { name: string };
      const room: DataRoom = {
        id: `generated-${nextId++}`,
        name: body.name,
        ownerId: mockUser.id,
        rootFolderId: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };
      rooms.push({ ...room, access: 'OWNER' });
      return jsonResponse(room, 201);
    }
    if (idMatch && method === 'PATCH') {
      const id = idMatch[1];
      const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { name: string };
      const index = rooms.findIndex((room) => room.id === id);
      if (index === -1) return jsonResponse({ message: 'Data Room not found.' }, 404);
      // A new object, never mutating the room passed in by the caller — `rooms` starts
      // as a shallow copy of `initialRooms`, so mutating an element in place would leak
      // the rename into whatever fixture array the test suite reuses across cases.
      const updated = { ...rooms[index], name: body.name, updatedAt: '2026-01-03T00:00:00.000Z' };
      rooms[index] = updated;
      const { access: _access, ...room } = updated;
      return jsonResponse(room satisfies DataRoom);
    }
    if (idMatch && method === 'DELETE') {
      const id = idMatch[1];
      const index = rooms.findIndex((room) => room.id === id);
      if (index === -1) return jsonResponse({ message: 'Data Room not found.' }, 404);
      rooms.splice(index, 1);
      return jsonResponse({ success: true });
    }

    throw new Error(`Unhandled fetch in test: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage — empty state', () => {
  it('shows the empty-state copy and the room list nav', async () => {
    stubDataRoomsApi();
    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('home-page');
    expect(within(page).getByText('Data Rooms')).toBeTruthy();
    // The list query is async (a real `fetch`, mocked or not) — `findByText` polls until
    // it resolves, rather than asserting on the initial "Loading…" render.
    expect(await within(page).findByText('You have no Data Rooms yet')).toBeTruthy();
    // The nav lives in the sidebar, outside the "home-page" content area.
    expect(await screen.findByText('None yet')).toBeTruthy();
    expect(await screen.findByText('Nothing shared with you')).toBeTruthy();
  });

  it('opens the create-room dialog from either "New Data Room" action', async () => {
    stubDataRoomsApi();
    const { router } = renderRouterAt('/home', {
      status: 'authenticated',
      user: mockUser,
    });

    const [newRoomButton, ...rest] = await screen.findAllByRole('button', {
      name: 'New Data Room',
    });
    expect(rest).toHaveLength(0);

    fireEvent.click(newRoomButton);
    expect(await screen.findByRole('heading', { name: 'New Data Room' })).toBeTruthy();
    // Opening the dialog is not navigation.
    expect(router.state.location.pathname).toBe('/home');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New Data Room' })).toBeNull(),
    );

    const cta = await screen.findByRole('button', {
      name: 'Create your first Data Room',
    });
    fireEvent.click(cta);
    expect(await screen.findByRole('heading', { name: 'New Data Room' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/home');
  });

  it('shows the signed-in user in the sidebar', async () => {
    stubDataRoomsApi();
    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    expect(await screen.findByText('ada@example.com')).toBeTruthy();
    expect(await screen.findByText('Sign out')).toBeTruthy();
  });
});

describe('HomePage — creating a Data Room', () => {
  it('disables the Create button and shows a loading label while the request is in flight, then closes the dialog', async () => {
    // `POST /data-rooms` is held open deliberately — resolving it as fast as the GET
    // response makes the pending state too brief to reliably observe (the mutation's
    // success can land before the next render is queried).
    // Promise executors run synchronously, so `resolvePost` is always assigned by the
    // time `new Promise(...)` returns — the definite-assignment assertion just tells TS.
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
          return jsonResponse({ items: [], nextCursor: null });
        }
        if (url.includes('/data-rooms') && method === 'POST') {
          return pendingPost;
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      }),
    );

    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first Data Room' }),
    );

    const nameInput = await screen.findByLabelText('Data Room name');
    fireEvent.change(nameInput, { target: { value: 'Project Halyard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Data Room' }));

    const submitButton = await screen.findByRole('button', { name: 'Creating…' });
    expect(submitButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);

    resolvePost(
      jsonResponse(
        {
          id: 'generated-1',
          name: 'Project Halyard',
          ownerId: mockUser.id,
          rootFolderId: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        201,
      ),
    );

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New Data Room' })).toBeNull(),
    );
  });
});

describe('HomePage — populated state', () => {
  const rooms: DataRoomListItem[] = [
    {
      id: 'room-1',
      name: 'Project Halyard',
      ownerId: mockUser.id,
      rootFolderId: 'folder-1',
      createdAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
      access: 'OWNER',
    },
    {
      id: 'room-2',
      name: 'Project Anchorage',
      ownerId: mockUser.id,
      rootFolderId: 'folder-2',
      createdAt: '2026-01-06T00:00:00.000Z',
      updatedAt: '2026-01-06T00:00:00.000Z',
      access: 'OWNER',
    },
  ];

  it('navigates to the room\'s root folder when its name is clicked in the table', async () => {
    stubDataRoomsApi(rooms);
    const { router } = renderRouterAt('/home', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('home-page');
    fireEvent.click(await within(page).findByText('Project Halyard'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/folders/folder-1'));
  });

  it('navigates to the room\'s root folder when its sidebar nav entry is clicked', async () => {
    stubDataRoomsApi(rooms);
    const { router } = renderRouterAt('/home', {
      status: 'authenticated',
      user: mockUser,
    });

    const nav = await screen.findByRole('navigation', { name: 'Your Data Rooms' });
    fireEvent.click(await within(nav).findByText('Project Anchorage'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/folders/folder-2'));
  });

  it('lists owned rooms in the sidebar nav and the "Owned by you" table, with Share still inert', async () => {
    stubDataRoomsApi(rooms);
    const { router } = renderRouterAt('/home', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('home-page');
    expect(await within(page).findByText('Owned by you')).toBeTruthy();
    expect(within(page).getByText('Project Halyard')).toBeTruthy();
    expect(within(page).getByText('Project Anchorage')).toBeTruthy();
    expect(within(page).queryByText('You have no Data Rooms yet')).toBeNull();

    // The sidebar nav lists the same rooms, outside "home-page".
    const nav = screen.getByRole('navigation', { name: 'Your Data Rooms' });
    expect(within(nav).getByText('Project Halyard')).toBeTruthy();
    expect(within(nav).getByText('Project Anchorage')).toBeTruthy();

    // Radix opens `DropdownMenuTrigger` on pointerdown, not click — see
    // libs/ui/src/components/ui/dropdown-menu/dropdown-menu.spec.tsx for the same note.
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Project Halyard' }),
      { button: 0 },
    );
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeTruthy();
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete' });
    fireEvent.click(deleteItem);

    // Delete opens its confirm dialog (see the "deleting a Data Room" describe block
    // below for the full flow) — Share alone stays a no-op.
    expect(await screen.findByRole('heading', { name: /Delete the Data Room/ })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/home');
  });

  function openRowMenu(roomName: string) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${roomName}` }), {
      button: 0,
    });
  }

  it('renames a room: disables Save and shows a loading label while in flight, closes the dialog, and toasts on success', async () => {
    // Held open deliberately — same reasoning as the create-room pending test above: a
    // PATCH resolved as fast as the GET makes the pending state too brief to observe.
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
          return jsonResponse({ items: rooms, nextCursor: null });
        }
        if (url.includes('/data-rooms/') && method === 'PATCH') {
          return pendingPatch;
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      }),
    );

    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    // "Project Halyard" appears in both the sidebar nav and the table — scope to the
    // table so queries stay unambiguous.
    const page = await screen.findByTestId('home-page');
    await within(page).findByText('Project Halyard');
    openRowMenu('Project Halyard');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const nameInput = await screen.findByLabelText('Data Room name');
    expect(nameInput).toHaveProperty('value', 'Project Halyard');
    fireEvent.change(nameInput, { target: { value: 'Project Halyard II' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const savingButton = await screen.findByRole('button', { name: 'Saving…' });
    expect(savingButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);

    resolvePatch(
      jsonResponse({
        id: rooms[0].id,
        name: 'Project Halyard II',
        ownerId: mockUser.id,
        rootFolderId: rooms[0].rootFolderId,
        createdAt: rooms[0].createdAt,
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Rename Data Room' })).toBeNull(),
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Renamed to "Project Halyard II"',
    );
  });

  it('deletes a room: gates the button on typing the exact name, shows a loading label, closes the dialog, and toasts on success', async () => {
    // Same reasoning as above — hold the DELETE open long enough to observe "Deleting…".
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
        return jsonResponse({ items: rooms, nextCursor: null });
      }
      if (url.includes('/data-rooms/') && method === 'DELETE') {
        return pendingDelete;
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('home-page');
    await within(page).findByText('Project Halyard');
    openRowMenu('Project Halyard');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirmInput = await screen.findByLabelText('Type the room name to confirm');
    const deleteButton = screen.getByRole('button', { name: 'Delete Data Room' });
    expect(deleteButton).toHaveProperty('disabled', true);

    fireEvent.change(confirmInput, { target: { value: 'not quite right' } });
    expect(deleteButton).toHaveProperty('disabled', true);

    fireEvent.change(confirmInput, { target: { value: 'Project Halyard' } });
    expect(deleteButton).toHaveProperty('disabled', false);

    fireEvent.click(deleteButton);
    const deletingButton = await screen.findByRole('button', { name: 'Deleting…' });
    expect(deletingButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);

    resolveDelete(jsonResponse({ success: true }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Delete the Data Room/ })).toBeNull(),
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Data Room "Project Halyard" deleted permanently',
    );

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
    // Not asserted here: the row disappearing from the table. `useDeleteDataRoomMutation`
    // invalidates via the `queryClient` singleton exported from `lib/api.ts` — the one
    // `main.tsx` actually mounts `QueryClientProvider` with — but `renderRouterAt` gives
    // every test its own fresh `QueryClient` (see its doc comment), so that invalidation
    // never reaches this render's cache. Same pre-existing gap the create-room test above
    // works around by not asserting the created room appears in the list either.
  });
});
