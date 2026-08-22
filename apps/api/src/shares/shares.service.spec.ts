import { SharesService } from './shares.service.js';

describe('SharesService.create', () => {
  function buildService(overrides: {
    existingUser?: { id: string } | null;
    createdShare?: Record<string, unknown>;
  }) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(overrides.existingUser ?? null) },
      share: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'share-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            expiresAt: null,
            revokedAt: null,
            granteeEmail: null,
            granteeUserId: null,
            ...data,
            // A field explicitly passed as `undefined` (omitted, in Prisma terms) reads
            // back as `null` from a real DB — mirror that here rather than letting
            // `undefined` leak through.
            ...(data.granteeUserId === undefined ? { granteeUserId: null } : {}),
            ...overrides.createdShare,
          }),
        ),
      },
    };
    const accessControl = { requireAccess: jest.fn().mockResolvedValue('OWNER') };
    return {
      service: new SharesService(prisma as never, accessControl as never),
      prisma,
      accessControl,
    };
  }

  it("resolves granteeUserId immediately when the invited email already has an account", async () => {
    const { service, prisma } = buildService({ existingUser: { id: 'user-42' } });

    const share = await service.create('owner-1', {
      resourceType: 'DATA_ROOM',
      resourceId: 'room-1',
      role: 'VIEWER',
      mode: 'email',
      granteeEmail: 'Anton@Coverr.co',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'anton@coverr.co' },
      select: { id: true },
    });
    expect(share.granteeUserId).toBe('user-42');
    expect(prisma.share.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          granteeEmail: 'anton@coverr.co',
          granteeUserId: 'user-42',
        }),
      }),
    );
  });

  it('leaves granteeUserId unset when no account matches the invited email yet', async () => {
    const { service, prisma } = buildService({ existingUser: null });

    const share = await service.create('owner-1', {
      resourceType: 'DATA_ROOM',
      resourceId: 'room-1',
      role: 'VIEWER',
      mode: 'email',
      granteeEmail: 'new-person@example.com',
    });

    expect(share.granteeUserId).toBeNull();
    expect(prisma.share.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ granteeUserId: undefined }),
      }),
    );
  });

  it('never looks up a user for a public-mode share', async () => {
    const { service, prisma } = buildService({});

    await service.create('owner-1', {
      resourceType: 'DATA_ROOM',
      resourceId: 'room-1',
      role: 'VIEWER',
      mode: 'public',
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * Fast, DB-free unit tests against a mocked `PrismaService`, same pattern as
 * `AccessControlService`'s spec — `share.findMany`/`folder.findMany`/`file.findMany`/
 * `dataRoom.findMany` are mocked to return exactly the rows handed to them, so these
 * tests prove `listSharedWithMe`'s own reduction logic (resolve → filter → map), not
 * Postgres's actual filtering.
 */
describe('SharesService.listSharedWithMe', () => {
  function buildService(overrides: {
    shares?: {
      id: string;
      resourceType: 'DATA_ROOM' | 'FOLDER' | 'FILE';
      resourceId: string;
      role: 'VIEWER' | 'EDITOR';
      createdAt: Date;
      createdBy: { email: string };
    }[];
    dataRooms?: { id: string; name: string; ownerId: string; rootFolderId: string | null }[];
    folders?: { id: string; name: string; dataRoomId: string }[];
    files?: { id: string; name: string; dataRoomId: string }[];
  }) {
    const prisma = {
      share: { findMany: jest.fn().mockResolvedValue(overrides.shares ?? []) },
      dataRoom: { findMany: jest.fn().mockResolvedValue(overrides.dataRooms ?? []) },
      folder: { findMany: jest.fn().mockResolvedValue(overrides.folders ?? []) },
      file: { findMany: jest.fn().mockResolvedValue(overrides.files ?? []) },
    };
    const accessControl = {};
    return {
      service: new SharesService(prisma as never, accessControl as never),
      prisma,
    };
  }

  const baseQuery = { limit: 50 };

  it('surfaces a DATA_ROOM share, resolving folderId to the room\'s root folder', async () => {
    const { service, prisma } = buildService({
      shares: [
        {
          id: 'share-1',
          resourceType: 'DATA_ROOM',
          resourceId: 'room-1',
          role: 'VIEWER',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: { email: 'owner@example.com' },
        },
      ],
      dataRooms: [{ id: 'room-1', name: 'Project Halyard', ownerId: 'owner-1', rootFolderId: 'root-1' }],
    });

    const result = await service.listSharedWithMe('grantee-1', baseQuery);

    expect(result.items).toEqual([
      {
        resourceType: 'DATA_ROOM',
        resourceId: 'room-1',
        name: 'Project Halyard',
        role: 'VIEWER',
        sharedByEmail: 'owner@example.com',
        folderId: 'root-1',
      },
    ]);
    // Only shares actually granted to this user, active, EMAIL-mode.
    expect(prisma.share.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          granteeUserId: 'grantee-1',
          mode: 'EMAIL',
          revokedAt: null,
        }),
      }),
    );
  });

  it('surfaces a FOLDER share, resolving folderId to the folder itself', async () => {
    const { service } = buildService({
      shares: [
        {
          id: 'share-1',
          resourceType: 'FOLDER',
          resourceId: 'folder-9',
          role: 'EDITOR',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: { email: 'owner@example.com' },
        },
      ],
      folders: [{ id: 'folder-9', name: 'Diligence', dataRoomId: 'room-1' }],
      dataRooms: [{ id: 'room-1', name: 'Project Halyard', ownerId: 'owner-1', rootFolderId: 'root-1' }],
    });

    const result = await service.listSharedWithMe('grantee-1', baseQuery);

    expect(result.items).toEqual([
      {
        resourceType: 'FOLDER',
        resourceId: 'folder-9',
        name: 'Diligence',
        role: 'EDITOR',
        sharedByEmail: 'owner@example.com',
        folderId: 'folder-9',
      },
    ]);
  });

  it('surfaces a FILE share with a null folderId', async () => {
    const { service } = buildService({
      shares: [
        {
          id: 'share-1',
          resourceType: 'FILE',
          resourceId: 'file-3',
          role: 'VIEWER',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: { email: 'owner@example.com' },
        },
      ],
      files: [{ id: 'file-3', name: 'contract.pdf', dataRoomId: 'room-1' }],
      dataRooms: [{ id: 'room-1', name: 'Project Halyard', ownerId: 'owner-1', rootFolderId: 'root-1' }],
    });

    const result = await service.listSharedWithMe('grantee-1', baseQuery);

    expect(result.items).toEqual([
      {
        resourceType: 'FILE',
        resourceId: 'file-3',
        name: 'contract.pdf',
        role: 'VIEWER',
        sharedByEmail: 'owner@example.com',
        folderId: null,
      },
    ]);
  });

  it('drops a share whose resource no longer exists (orphaned)', async () => {
    const { service } = buildService({
      shares: [
        {
          id: 'share-1',
          resourceType: 'DATA_ROOM',
          resourceId: 'deleted-room',
          role: 'VIEWER',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: { email: 'owner@example.com' },
        },
      ],
      dataRooms: [],
    });

    const result = await service.listSharedWithMe('grantee-1', baseQuery);

    expect(result.items).toEqual([]);
  });

  it('drops a share on a Data Room the caller already owns', async () => {
    const { service } = buildService({
      shares: [
        {
          id: 'share-1',
          resourceType: 'DATA_ROOM',
          resourceId: 'room-1',
          role: 'VIEWER',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: { email: 'someone@example.com' },
        },
      ],
      dataRooms: [{ id: 'room-1', name: 'Project Halyard', ownerId: 'grantee-1', rootFolderId: 'root-1' }],
    });

    const result = await service.listSharedWithMe('grantee-1', baseQuery);

    expect(result.items).toEqual([]);
  });

  it('drops a FILE share whose Data Room the caller already owns', async () => {
    const { service } = buildService({
      shares: [
        {
          id: 'share-1',
          resourceType: 'FILE',
          resourceId: 'file-3',
          role: 'VIEWER',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: { email: 'someone@example.com' },
        },
      ],
      files: [{ id: 'file-3', name: 'contract.pdf', dataRoomId: 'room-1' }],
      dataRooms: [{ id: 'room-1', name: 'Project Halyard', ownerId: 'grantee-1', rootFolderId: 'root-1' }],
    });

    const result = await service.listSharedWithMe('grantee-1', baseQuery);

    expect(result.items).toEqual([]);
  });

  it('paginates: returns nextCursor when more rows exist than the page limit', async () => {
    const shares = Array.from({ length: 2 }, (_, i) => ({
      id: `share-${i}`,
      resourceType: 'DATA_ROOM' as const,
      resourceId: `room-${i}`,
      role: 'VIEWER' as const,
      createdAt: new Date(`2026-01-0${i + 1}T00:00:00.000Z`),
      createdBy: { email: 'owner@example.com' },
    }));
    const { service } = buildService({
      shares,
      dataRooms: shares.map((s) => ({
        id: s.resourceId,
        name: s.resourceId,
        ownerId: 'owner-1',
        rootFolderId: `${s.resourceId}-root`,
      })),
    });

    const result = await service.listSharedWithMe('grantee-1', { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });
});
