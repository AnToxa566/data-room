import { NotFoundException } from '@nestjs/common';

import { AccessControlService } from './access-control.service.js';

/**
 * Fast, DB-free unit tests against a mocked `PrismaService` — the three scenarios
 * AGENTS.md calls out explicitly, plus `requireAccess`'s own branching. The same three
 * scenarios are exercised again in apps/api-e2e against the real database (see
 * apps/api-e2e/src/access-control/access-control.e2e.spec.ts); this file is the fast,
 * isolated complement, not a replacement.
 */
describe('AccessControlService', () => {
  function buildService(overrides: {
    dataRoom?: { ownerId: string } | null;
    folder?: { dataRoom: { ownerId: string } } | null;
    file?: { dataRoom: { ownerId: string } } | null;
  }) {
    const prisma = {
      dataRoom: { findUnique: jest.fn().mockResolvedValue(overrides.dataRoom ?? null) },
      folder: { findUnique: jest.fn().mockResolvedValue(overrides.folder ?? null) },
      file: { findUnique: jest.fn().mockResolvedValue(overrides.file ?? null) },
    };
    return {
      service: new AccessControlService(prisma as never),
      prisma,
    };
  }

  describe('resolveAccess', () => {
    it("resolves OWNER for the owner of a Data Room", async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'user-1' } });

      await expect(service.resolveAccess('user-1', 'DATA_ROOM', 'room-1')).resolves.toBe(
        'OWNER',
      );
    });

    it('resolves OWNER for a folder inside a Data Room the user owns', async () => {
      const { service, prisma } = buildService({
        folder: { dataRoom: { ownerId: 'user-1' } },
      });

      await expect(service.resolveAccess('user-1', 'FOLDER', 'folder-1')).resolves.toBe(
        'OWNER',
      );
      // One query, via the folder -> dataRoom join — not two round trips.
      expect(prisma.folder.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.folder.findUnique).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        select: { dataRoom: { select: { ownerId: true } } },
      });
    });

    it('resolves OWNER for a file inside a Data Room the user owns', async () => {
      const { service } = buildService({ file: { dataRoom: { ownerId: 'user-1' } } });

      await expect(service.resolveAccess('user-1', 'FILE', 'file-1')).resolves.toBe(
        'OWNER',
      );
    });

    it('resolves null for a non-owner', async () => {
      const { service } = buildService({ dataRoom: { ownerId: 'user-1' } });

      await expect(service.resolveAccess('user-2', 'DATA_ROOM', 'room-1')).resolves.toBe(
        null,
      );
    });

    it('resolves null for a non-existent resource', async () => {
      const { service } = buildService({});

      await expect(
        service.resolveAccess('user-1', 'DATA_ROOM', 'does-not-exist'),
      ).resolves.toBe(null);
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
  });
});
