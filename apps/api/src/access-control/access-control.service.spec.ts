import { NotFoundException } from '@nestjs/common';

import { AccessControlService } from './access-control.service.js';

/**
 * Fast, DB-free unit tests against a mocked `PrismaService`. `prisma.share.findMany` is
 * mocked to return exactly the rows we hand it — so tests here prove the *reduction*
 * logic (which rows apply to `userId`, strongest role wins) is correct, while the actual
 * DB-level filters (`revokedAt: null`, the expiry `OR`) are proven by asserting the query
 * shape sent to `findMany`, not by re-implementing Postgres's filtering in a mock. Those
 * filters, and the three scenarios AGENTS.md calls out, are exercised again end-to-end
 * against the real database in apps/api-e2e/src/access-control/access-control.e2e.spec.ts;
 * this file is the fast, isolated complement, not a replacement.
 */
describe('AccessControlService', () => {
  function buildService(overrides: {
    dataRoom?: { ownerId: string } | null;
    folder?: { dataRoomId: string; path: string; dataRoom: { ownerId: string } } | null;
    file?: {
      dataRoomId: string;
      dataRoom: { ownerId: string };
      folder: { path: string };
    } | null;
    shares?: {
      role: string;
      mode: string;
      granteeUserId: string | null;
      // Only needed by `resolveShareContext` tests (not `resolveAccess`/`requireAccess`,
      // which never select them) — optional so every existing share fixture above stays
      // as-is.
      resourceType?: string;
      resourceId?: string;
      createdAt?: Date;
      createdBy?: { email: string };
    }[];
  }) {
    const prisma = {
      dataRoom: { findUnique: jest.fn().mockResolvedValue(overrides.dataRoom ?? null) },
      folder: { findUnique: jest.fn().mockResolvedValue(overrides.folder ?? null) },
      file: { findUnique: jest.fn().mockResolvedValue(overrides.file ?? null) },
      share: { findMany: jest.fn().mockResolvedValue(overrides.shares ?? []) },
    };
    return {
      service: new AccessControlService(prisma as never),
      prisma,
    };
  }

  describe('resolveAccess — ownership', () => {
    it("resolves OWNER for the owner of a Data Room", async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'user-1' } });

      await expect(service.resolveAccess('user-1', 'DATA_ROOM', 'room-1')).resolves.toBe(
        'OWNER',
      );
    });

    it('resolves OWNER for a folder inside a Data Room the user owns', async () => {
      const { service, prisma } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'user-1' } },
      });

      await expect(service.resolveAccess('user-1', 'FOLDER', 'folder-1')).resolves.toBe(
        'OWNER',
      );
      // One query, via the folder -> dataRoom join — not two round trips.
      expect(prisma.folder.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.folder.findUnique).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        select: { dataRoomId: true, path: true, dataRoom: { select: { ownerId: true } } },
      });
      // Owner resolves without ever consulting Share rows.
      expect(prisma.share.findMany).not.toHaveBeenCalled();
    });

    it('resolves OWNER for a file inside a Data Room the user owns', async () => {
      const { service } = buildService({
        file: { dataRoomId: 'room-1', dataRoom: { ownerId: 'user-1' }, folder: { path: '/root-1/folder-1/' } },
      });

      await expect(service.resolveAccess('user-1', 'FILE', 'file-1')).resolves.toBe(
        'OWNER',
      );
    });

    it('resolves null for a non-owner with no matching share', async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'user-1' } });

      await expect(service.resolveAccess('user-2', 'DATA_ROOM', 'room-1')).resolves.toBe(
        null,
      );
    });

    it('resolves null for a non-existent resource, never touching Share', async () => {
      const { service, prisma } = buildService({});

      await expect(
        service.resolveAccess('user-1', 'DATA_ROOM', 'does-not-exist'),
      ).resolves.toBe(null);
      expect(prisma.share.findMany).not.toHaveBeenCalled();
    });
  });

  describe('resolveAccess — sharing', () => {
    it('resolves a role from a share directly on the resource', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        shares: [{ role: 'VIEWER', mode: 'EMAIL', granteeUserId: 'user-2' }],
      });

      await expect(service.resolveAccess('user-2', 'FOLDER', 'folder-1')).resolves.toBe(
        'VIEWER',
      );
    });

    it('resolves a role inherited from an ancestor folder, via the materialized path', async () => {
      const { service, prisma } = buildService({
        folder: {
          dataRoomId: 'room-1',
          path: '/root-1/parent-1/folder-1/',
          dataRoom: { ownerId: 'owner' },
        },
        shares: [{ role: 'VIEWER', mode: 'EMAIL', granteeUserId: 'user-2' }],
      });

      await expect(service.resolveAccess('user-2', 'FOLDER', 'folder-1')).resolves.toBe(
        'VIEWER',
      );
      // Candidates cover the Data Room, and every folder in the path — root, parent, self.
      expect(prisma.share.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revokedAt: null,
            OR: [
              { resourceType: 'DATA_ROOM', resourceId: 'room-1' },
              { resourceType: 'FOLDER', resourceId: 'root-1' },
              { resourceType: 'FOLDER', resourceId: 'parent-1' },
              { resourceType: 'FOLDER', resourceId: 'folder-1' },
            ],
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }],
          }),
        }),
      );
    });

    it('resolves a role inherited from the Data Room, for a file nested several folders deep', async () => {
      const { service } = buildService({
        file: {
          dataRoomId: 'room-1',
          dataRoom: { ownerId: 'owner' },
          folder: { path: '/root-1/parent-1/folder-1/' },
        },
        shares: [{ role: 'EDITOR', mode: 'EMAIL', granteeUserId: 'user-2' }],
      });

      await expect(service.resolveAccess('user-2', 'FILE', 'file-1')).resolves.toBe(
        'EDITOR',
      );
    });

    it('takes the strongest of several matching shares, regardless of array order', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        shares: [
          { role: 'VIEWER', mode: 'EMAIL', granteeUserId: 'user-2' },
          { role: 'EDITOR', mode: 'EMAIL', granteeUserId: 'user-2' },
        ],
      });

      await expect(service.resolveAccess('user-2', 'FOLDER', 'folder-1')).resolves.toBe(
        'EDITOR',
      );
    });

    it('grants a PUBLIC share to an anonymous caller (userId: null)', async () => {
      const { service } = buildService({
        file: { dataRoomId: 'room-1', dataRoom: { ownerId: 'owner' }, folder: { path: '/root-1/folder-1/' } },
        shares: [{ role: 'VIEWER', mode: 'PUBLIC', granteeUserId: null }],
      });

      await expect(service.resolveAccess(null, 'FILE', 'file-1')).resolves.toBe('VIEWER');
    });

    it('a PUBLIC share also applies to a logged-in caller, combined with their own grant (strongest wins)', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        shares: [
          { role: 'VIEWER', mode: 'PUBLIC', granteeUserId: null },
          { role: 'EDITOR', mode: 'EMAIL', granteeUserId: 'user-2' },
        ],
      });

      await expect(service.resolveAccess('user-2', 'FOLDER', 'folder-1')).resolves.toBe(
        'EDITOR',
      );
    });

    it('never grants access via granteeEmail — an unresolved invitation (granteeUserId: null) does not match', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        // Simulates an EMAIL share whose invitation hasn't been resolved to a user yet —
        // the select in the service doesn't even fetch granteeEmail, so there is no way
        // for this row to match by email even if the caller's email happened to equal it.
        shares: [{ role: 'EDITOR', mode: 'EMAIL', granteeUserId: null }],
      });

      await expect(service.resolveAccess('user-2', 'FOLDER', 'folder-1')).resolves.toBe(
        null,
      );
    });

    it('resolves null for an anonymous caller when no share applies', async () => {
      const { service } = buildService({
        file: { dataRoomId: 'room-1', dataRoom: { ownerId: 'owner' }, folder: { path: '/root-1/folder-1/' } },
        shares: [{ role: 'EDITOR', mode: 'EMAIL', granteeUserId: 'user-2' }],
      });

      await expect(service.resolveAccess(null, 'FILE', 'file-1')).resolves.toBe(null);
    });
  });

  describe('requireAccess', () => {
    it('returns the resolved level when it meets the minimum', async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'user-1' } });

      await expect(
        service.requireAccess('user-1', 'DATA_ROOM', 'room-1', 'OWNER'),
      ).resolves.toBe('OWNER');
    });

    it('throws NotFoundException (404), never ForbiddenException, for an invisible resource', async () => {
      const { service } = buildService({});

      await expect(
        service.requireAccess('user-1', 'DATA_ROOM', 'room-1', 'VIEWER'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException (404) for a resource that exists but belongs to someone else', async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'someone-else' } });

      await expect(
        service.requireAccess('user-1', 'DATA_ROOM', 'room-1', 'VIEWER'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException (403) when a share grants access below the required minimum', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        shares: [{ role: 'VIEWER', mode: 'EMAIL', granteeUserId: 'user-2' }],
      });

      await expect(
        service.requireAccess('user-2', 'FOLDER', 'folder-1', 'EDITOR'),
      ).rejects.toThrow(/permission/i);
    });

    it('throws NotFoundException (404) for an anonymous caller with no public share', async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'owner' } });

      await expect(
        service.requireAccess(null, 'DATA_ROOM', 'room-1', 'VIEWER'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolveShareContext', () => {
    it('resolves isOwner: true, with no boundary/attribution, for the owner', async () => {
      const { service, prisma } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'user-1' } },
      });

      await expect(
        service.resolveShareContext('user-1', 'FOLDER', 'folder-1'),
      ).resolves.toEqual({
        isOwner: true,
        sharedByEmail: null,
        sharedRootType: null,
        sharedRootId: null,
      });
      // The owner branch never needs to look at Share rows at all.
      expect(prisma.share.findMany).not.toHaveBeenCalled();
    });

    it('resolves the widest matching candidate as the boundary for a DATA_ROOM-level share on a subfolder', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        shares: [
          {
            role: 'VIEWER',
            mode: 'EMAIL',
            granteeUserId: 'user-2',
            resourceType: 'DATA_ROOM',
            resourceId: 'room-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: { email: 'owner@example.com' },
          },
        ],
      });

      await expect(
        service.resolveShareContext('user-2', 'FOLDER', 'folder-1'),
      ).resolves.toEqual({
        isOwner: false,
        sharedByEmail: 'owner@example.com',
        sharedRootType: 'DATA_ROOM',
        sharedRootId: 'room-1',
      });
    });

    it('resolves the ancestor folder as the boundary for a FOLDER-level share, not the Data Room', async () => {
      const { service } = buildService({
        folder: {
          dataRoomId: 'room-1',
          path: '/root-1/parent-1/folder-1/',
          dataRoom: { ownerId: 'owner' },
        },
        shares: [
          {
            role: 'VIEWER',
            mode: 'EMAIL',
            granteeUserId: 'user-2',
            resourceType: 'FOLDER',
            resourceId: 'parent-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: { email: 'sharer@example.com' },
          },
        ],
      });

      await expect(
        service.resolveShareContext('user-2', 'FOLDER', 'folder-1'),
      ).resolves.toEqual({
        isOwner: false,
        sharedByEmail: 'sharer@example.com',
        sharedRootType: 'FOLDER',
        sharedRootId: 'parent-1',
      });
    });

    it('prefers the wider DATA_ROOM-level share as the boundary over a narrower FOLDER-level share that also applies', async () => {
      const { service } = buildService({
        folder: {
          dataRoomId: 'room-1',
          path: '/root-1/parent-1/folder-1/',
          dataRoom: { ownerId: 'owner' },
        },
        shares: [
          {
            role: 'VIEWER',
            mode: 'EMAIL',
            granteeUserId: 'user-2',
            resourceType: 'FOLDER',
            resourceId: 'parent-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: { email: 'narrow-sharer@example.com' },
          },
          {
            role: 'VIEWER',
            mode: 'PUBLIC',
            granteeUserId: null,
            resourceType: 'DATA_ROOM',
            resourceId: 'room-1',
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            createdBy: { email: 'wide-sharer@example.com' },
          },
        ],
      });

      // The narrower FOLDER share is listed first — order must not matter, only
      // candidate width (shareCandidates is DATA_ROOM-first).
      await expect(
        service.resolveShareContext('user-2', 'FOLDER', 'folder-1'),
      ).resolves.toEqual({
        isOwner: false,
        sharedByEmail: 'wide-sharer@example.com',
        sharedRootType: 'DATA_ROOM',
        sharedRootId: 'room-1',
      });
    });

    it('resolves a FILE-typed boundary for a share directly on the file itself', async () => {
      const { service } = buildService({
        file: {
          dataRoomId: 'room-1',
          dataRoom: { ownerId: 'owner' },
          folder: { path: '/root-1/parent-1/' },
        },
        shares: [
          {
            role: 'VIEWER',
            mode: 'PUBLIC',
            granteeUserId: null,
            resourceType: 'FILE',
            resourceId: 'file-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: { email: 'sharer@example.com' },
          },
        ],
      });

      await expect(service.resolveShareContext(null, 'FILE', 'file-1')).resolves.toEqual({
        isOwner: false,
        sharedByEmail: 'sharer@example.com',
        sharedRootType: 'FILE',
        sharedRootId: 'file-1',
      });
    });

    it('attributes "shared by" to the strongest-role share when two shares apply at the same (widest) candidate', async () => {
      const { service } = buildService({
        folder: { dataRoomId: 'room-1', path: '/root-1/folder-1/', dataRoom: { ownerId: 'owner' } },
        shares: [
          {
            role: 'VIEWER',
            mode: 'PUBLIC',
            granteeUserId: null,
            resourceType: 'FOLDER',
            resourceId: 'folder-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: { email: 'public-sharer@example.com' },
          },
          {
            role: 'EDITOR',
            mode: 'EMAIL',
            granteeUserId: 'user-2',
            resourceType: 'FOLDER',
            resourceId: 'folder-1',
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            createdBy: { email: 'invited-by@example.com' },
          },
        ],
      });

      const result = await service.resolveShareContext('user-2', 'FOLDER', 'folder-1');
      expect(result.sharedByEmail).toBe('invited-by@example.com');
    });

    it('throws NotFoundException (404) if the resource disappears between the caller\'s own requireAccess and this call', async () => {
      const { service } = buildService({});

      await expect(
        service.resolveShareContext('user-1', 'DATA_ROOM', 'room-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
