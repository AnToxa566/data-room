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
      return jsonResponse(fileOverride);
    }
    if (url.includes(`/folders/${folder.id}`)) {
      return jsonResponse({
        ...folder,
        breadcrumbs: [{ id: folder.id, name: folder.name }],
        isRoot: folder.parentId === null,
      });
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

  it('leaves Download, Share, Rename, Move, and Delete inert', async () => {
    stubFileApi();
    const { router } = renderRouterAt('/files/file-1', {
      status: 'authenticated',
      user: mockUser,
    });

    const page = await screen.findByTestId('file-page');
    await within(page).findByText('NDA.pdf');

    fireEvent.click(within(page).getByRole('button', { name: 'Download' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Share' }));
    fireEvent.pointerDown(within(page).getByRole('button', { name: 'More actions' }), {
      button: 0,
    });
    for (const name of ['Rename', 'Move', 'Delete']) {
      expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(router.state.location.pathname).toBe('/files/file-1');
    expect(screen.queryByRole('dialog')).toBeNull();
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
    stubFileApi({ fileStatus: 404 });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "Couldn't load this file. Try refreshing the page.",
    );
  });
});
