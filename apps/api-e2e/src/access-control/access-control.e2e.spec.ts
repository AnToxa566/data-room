import { INestApplication } from '@nestjs/common';

// See the identical comment in ../support/test-app.ts — documented exception to
// `@nx/enforce-module-boundaries`'s "no app imports" default, per ARCHITECTURE.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { AccessControlService, PrismaService } from '@dataroom/api';

import { createTestApp, TestApp } from '../support/test-app.js';
import { seedUser } from '../support/fixtures.js';

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Exercises `AccessControlService` directly against the real database — not through
 * HTTP — per AGENTS.md Part 1 ("Unit-test this service directly, not only through
 * endpoints"). A faster, DB-free complement using a mocked `PrismaService` lives at
 * apps/api/src/access-control/access-control.service.spec.ts; this file is what proves
 * the real Prisma queries behind it are correct.
 */
describe('AccessControlService (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let prisma: PrismaService;
  let accessControl: AccessControlService;

  const pendingUserIds: string[] = [];
  const pendingDataRoomIds: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.moduleRef.get(PrismaService);
    accessControl = testApp.moduleRef.get(AccessControlService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // DataRoom -> Folder cascades (ARCHITECTURE.md §4), so deleting the room is enough.
    if (pendingDataRoomIds.length) {
      await prisma.dataRoom.deleteMany({
        where: { id: { in: pendingDataRoomIds.splice(0) } },
      });
    }
    if (pendingUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: pendingUserIds.splice(0) } } });
    }
  });

  /** Creates a Data Room with its root folder, mirroring DataRoomsService.create's
   * transaction — this suite deliberately doesn't go through the HTTP layer or
   * DataRoomsService, since it's testing AccessControlService in isolation. */
  async function seedDataRoomWithRootFolder(ownerId: string) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.dataRoom.create({
        data: { name: 'AccessControl fixture room', ownerId },
      });
      const folder = await tx.folder.create({
        data: { name: '/', dataRoomId: room.id, parentId: null, path: '', depth: 0 },
      });
      await tx.folder.update({
        where: { id: folder.id },
        data: { path: `/${folder.id}/` },
      });
      return tx.dataRoom.update({
        where: { id: room.id },
        data: { rootFolderId: folder.id },
      });
    });
  }

  it('resolves OWNER for the owner of a Data Room, and for a folder inside it', async () => {
    const owner = await seedUser(prisma, 'ac-owner');
    pendingUserIds.push(owner.id);
    const room = await seedDataRoomWithRootFolder(owner.id);
    pendingDataRoomIds.push(room.id);

    await expect(
      accessControl.resolveAccess(owner.id, 'DATA_ROOM', room.id),
    ).resolves.toBe('OWNER');
    await expect(
      accessControl.resolveAccess(owner.id, 'FOLDER', room.rootFolderId as string),
    ).resolves.toBe('OWNER');
  });

  it('resolves null for a non-owner', async () => {
    const owner = await seedUser(prisma, 'ac-owner2');
    const other = await seedUser(prisma, 'ac-other');
    pendingUserIds.push(owner.id, other.id);
    const room = await seedDataRoomWithRootFolder(owner.id);
    pendingDataRoomIds.push(room.id);

    await expect(
      accessControl.resolveAccess(other.id, 'DATA_ROOM', room.id),
    ).resolves.toBeNull();
    await expect(
      accessControl.resolveAccess(other.id, 'FOLDER', room.rootFolderId as string),
    ).resolves.toBeNull();
  });

  it('resolves null for a non-existent resource', async () => {
    const someone = await seedUser(prisma, 'ac-nonexistent');
    pendingUserIds.push(someone.id);

    await expect(
      accessControl.resolveAccess(someone.id, 'DATA_ROOM', NON_EXISTENT_ID),
    ).resolves.toBeNull();
    await expect(
      accessControl.resolveAccess(someone.id, 'FOLDER', NON_EXISTENT_ID),
    ).resolves.toBeNull();
    await expect(
      accessControl.resolveAccess(someone.id, 'FILE', NON_EXISTENT_ID),
    ).resolves.toBeNull();
  });
});
