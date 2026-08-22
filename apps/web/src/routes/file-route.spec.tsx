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
          return jsonResponse(file);
        }
        if (url.includes('/folders/folder-1') && method === 'GET') {
          return jsonResponse({
            ...rootFolder,
            breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
            isRoot: true,
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
          return jsonResponse(file);
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
        return jsonResponse(file);
      }
      if (url.includes('/folders/folder-1/children') && method === 'GET') {
        return jsonResponse({ items: [], nextCursor: null });
      }
      if (url.includes('/folders/folder-1') && method === 'GET') {
        return jsonResponse({
          ...rootFolder,
          breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
          isRoot: true,
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
    stubFileApi({ fileStatus: 404 });
    renderRouterAt('/files/file-1', { status: 'authenticated', user: mockUser });

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "Couldn't load this file. Try refreshing the page.",
    );
  });
});
