import { fireEvent, screen, within } from '@testing-library/react';

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
 * reasoning as `stubDataRoomsApi` in `home-route.spec.tsx`.
 */
function stubFolderApi({
  children = [],
  folderStatus = 200,
}: {
  children?: unknown[];
  folderStatus?: number;
} = {}) {
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/data-rooms')) {
      return jsonResponse({ items: [room, otherRoom], nextCursor: null });
    }
    if (url.includes('/folders/folder-1/children')) {
      return jsonResponse({ items: children, nextCursor: null });
    }
    if (url.includes('/folders/folder-1')) {
      if (folderStatus !== 200) return jsonResponse({ message: 'Not found.' }, folderStatus);
      return jsonResponse({ ...rootFolder, breadcrumbs: [], isRoot: true });
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FolderPage — root, empty', () => {
  it("shows the room's name and the empty-state copy, with New folder/Upload/Share left inert", async () => {
    stubFolderApi();
    const { router } = renderRouterAt('/folders/folder-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('folder-page');
    expect(await within(page).findByText('Nothing in Project Halyard yet')).toBeTruthy();
    expect(within(page).getAllByText('Project Halyard').length).toBeGreaterThan(0);

    const newFolderButtons = within(page).getAllByRole('button', { name: 'New folder' });
    const uploadButtons = within(page).getAllByRole('button', {
      name: /^Upload( PDFs)?$/,
    });
    const shareButton = within(page).getByRole('button', { name: 'Share' });

    for (const button of [...newFolderButtons, ...uploadButtons, shareButton]) {
      fireEvent.click(button);
    }

    // Still on the same page, no dialog opened — the actions are genuinely inert.
    expect(router.state.location.pathname).toBe('/folders/folder-1');
    expect(screen.queryByRole('dialog')).toBeNull();
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
