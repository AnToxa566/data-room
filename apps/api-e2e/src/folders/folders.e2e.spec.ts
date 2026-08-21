import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import request from 'supertest';

// See the identical comment in ../support/test-app.ts — documented exception to
// `@nx/enforce-module-boundaries`'s "no app imports" default, per ARCHITECTURE.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PrismaService } from '@dataroom/api';

import { createTestApp, TestApp } from '../support/test-app.js';
import { seedUser, sessionCookieFor } from '../support/fixtures.js';

/**
 * Supertest against the real (in-process) Nest application — see
 * apps/api-e2e/src/support/test-app.ts for why only `GoogleAuthGuard` is mocked and
 * everything else (services, PrismaService, the database) runs for real.
 */
describe('Folders (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const pendingUserIds: string[] = [];
  const pendingDataRoomIds: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.moduleRef.get(PrismaService);
    jwtService = testApp.moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // DataRoom -> Folder cascades via the FK constraints already in the schema
    // (ARCHITECTURE.md §4), so deleting the room is enough to clean up its whole tree.
    if (pendingDataRoomIds.length) {
      await prisma.dataRoom.deleteMany({
        where: { id: { in: pendingDataRoomIds.splice(0) } },
      });
    }
    if (pendingUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: pendingUserIds.splice(0) } } });
    }
  });

  async function createUserAndCookie(label: string) {
    const user = await seedUser(prisma, label);
    pendingUserIds.push(user.id);
    return { user, cookie: sessionCookieFor(jwtService, user) };
  }

  async function createRoom(cookie: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/data-rooms')
      .set('Cookie', cookie)
      .send({ name })
      .expect(201);
    pendingDataRoomIds.push(res.body.id);
    return res.body as { id: string; rootFolderId: string };
  }

  async function createFolder(
    cookie: string,
    body: { dataRoomId: string; parentId: string; name: string },
    expectedStatus = 201,
  ) {
    return request(app.getHttpServer())
      .post('/api/folders')
      .set('Cookie', cookie)
      .send(body)
      .expect(expectedStatus);
  }

  describe('POST /api/folders', () => {
    it('creates nested folders three levels deep with exact path and depth', async () => {
      const { cookie } = await createUserAndCookie('nest');
      const room = await createRoom(cookie, 'Nested Room');
      const rootId = room.rootFolderId;

      const l1 = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: rootId,
        name: 'Level 1',
      })).body;
      expect(l1.depth).toBe(1);
      expect(l1.path).toBe(`/${rootId}/${l1.id}/`);

      const l2 = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: l1.id,
        name: 'Level 2',
      })).body;
      expect(l2.depth).toBe(2);
      expect(l2.path).toBe(`/${rootId}/${l1.id}/${l2.id}/`);

      const l3 = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: l2.id,
        name: 'Level 3',
      })).body;
      expect(l3.depth).toBe(3);
      expect(l3.path).toBe(`/${rootId}/${l1.id}/${l2.id}/${l3.id}/`);
    });

    it('409s on a duplicate name in the same parent', async () => {
      const { cookie } = await createUserAndCookie('dup');
      const room = await createRoom(cookie, 'Dup Room');

      await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Contracts',
      });
      await createFolder(
        cookie,
        { dataRoomId: room.id, parentId: room.rootFolderId, name: 'Contracts' },
        409,
      );
    });

    it('allows the same name in different parents', async () => {
      const { cookie } = await createUserAndCookie('same-name-diff-parent');
      const room = await createRoom(cookie, 'Room');

      const parentA = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Parent A',
      })).body;
      const parentB = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Parent B',
      })).body;

      await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: parentA.id,
        name: 'Financials',
      });
      await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: parentB.id,
        name: 'Financials',
      });
    });

    it('400s when parentId belongs to a different Data Room', async () => {
      const { cookie } = await createUserAndCookie('cross-room');
      const roomA = await createRoom(cookie, 'Room A');
      const roomB = await createRoom(cookie, 'Room B');

      await createFolder(
        cookie,
        { dataRoomId: roomA.id, parentId: roomB.rootFolderId, name: 'Cross' },
        400,
      );
    });
  });

  describe('GET /api/folders/:id', () => {
    it('returns the full ancestor chain, in order, and flags the root', async () => {
      const { cookie } = await createUserAndCookie('breadcrumbs');
      const room = await createRoom(cookie, 'Breadcrumb Room');
      const rootId = room.rootFolderId;

      const l1 = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: rootId,
        name: 'L1',
      })).body;
      const l2 = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: l1.id,
        name: 'L2',
      })).body;

      const res = await request(app.getHttpServer())
        .get(`/api/folders/${l2.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.breadcrumbs.map((b: { id: string }) => b.id)).toEqual([
        rootId,
        l1.id,
        l2.id,
      ]);
      expect(res.body.breadcrumbs.map((b: { name: string }) => b.name)).toEqual([
        '/',
        'L1',
        'L2',
      ]);
      expect(res.body.isRoot).toBe(false);

      const rootRes = await request(app.getHttpServer())
        .get(`/api/folders/${rootId}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(rootRes.body.isRoot).toBe(true);
      expect(rootRes.body.breadcrumbs).toEqual([{ id: rootId, name: '/' }]);
    });
  });

  describe('GET /api/folders/:id/children', () => {
    it('paginates with no duplicates and no gaps across pages', async () => {
      const { cookie } = await createUserAndCookie('paging');
      const room = await createRoom(cookie, 'Paging Room');
      const parent = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Paging Parent',
      })).body;

      const names = Array.from({ length: 60 }, (_, i) => `child-${String(i).padStart(3, '0')}`);
      await Promise.all(
        names.map((name) =>
          createFolder(cookie, { dataRoomId: room.id, parentId: parent.id, name }),
        ),
      );

      const seen = new Set<string>();
      let cursor: string | null = null;
      let pageCount = 0;
      do {
        const res = await request(app.getHttpServer())
          .get(`/api/folders/${parent.id}/children`)
          .query({ limit: 25, ...(cursor ? { cursor } : {}) })
          .set('Cookie', cookie)
          .expect(200);

        expect(res.body.items.length).toBeLessThanOrEqual(25);
        for (const item of res.body.items as Array<{ id: string; kind: string }>) {
          expect(item.kind).toBe('folder');
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        }
        cursor = res.body.nextCursor;
        pageCount++;
      } while (cursor);

      expect(seen.size).toBe(60);
      expect(pageCount).toBe(3); // 25 + 25 + 10
    });

    it('400s on a malformed cursor', async () => {
      const { cookie } = await createUserAndCookie('bad-cursor');
      const room = await createRoom(cookie, 'Bad Cursor Room');

      await request(app.getHttpServer())
        .get(`/api/folders/${room.rootFolderId}/children`)
        .query({ cursor: '!!!not-a-valid-cursor!!!' })
        .set('Cookie', cookie)
        .expect(400);
    });
  });

  describe('GET /api/folders/:id/stats', () => {
    it('counts the whole subtree, not just direct children', async () => {
      const { cookie } = await createUserAndCookie('stats');
      const room = await createRoom(cookie, 'Stats Room');
      const parent = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Stats Parent',
      })).body;
      const c1 = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: parent.id,
        name: 'c1',
      })).body;
      await createFolder(cookie, { dataRoomId: room.id, parentId: parent.id, name: 'c2' });
      await createFolder(cookie, { dataRoomId: room.id, parentId: c1.id, name: 'g1' });
      await createFolder(cookie, { dataRoomId: room.id, parentId: c1.id, name: 'g2' });

      const res = await request(app.getHttpServer())
        .get(`/api/folders/${parent.id}/stats`)
        .set('Cookie', cookie)
        .expect(200);

      // parent itself + c1 + c2 + g1 + g2 — the whole subtree, including the folder
      // itself, not just the two direct children.
      expect(res.body.folderCount).toBe(5);
      expect(res.body.totalSize).toBe('0');
      expect(res.body.fileCount).toBe(0);
    });
  });

  describe('PATCH /api/folders/:id', () => {
    it('400s renaming the root folder', async () => {
      const { cookie } = await createUserAndCookie('rename-root');
      const room = await createRoom(cookie, 'Rename Root Room');

      await request(app.getHttpServer())
        .patch(`/api/folders/${room.rootFolderId}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(400);
    });
  });

  describe('DELETE /api/folders/:id', () => {
    it('400s deleting the root folder', async () => {
      const { cookie } = await createUserAndCookie('delete-root');
      const room = await createRoom(cookie, 'Delete Root Room');

      await request(app.getHttpServer())
        .delete(`/api/folders/${room.rootFolderId}`)
        .set('Cookie', cookie)
        .expect(400);
    });

    it('removes the whole subtree of a mid-tree folder', async () => {
      const { cookie } = await createUserAndCookie('delete-midtree');
      const room = await createRoom(cookie, 'Delete Midtree Room');
      const branch = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Branch',
      })).body;
      const leaf = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: branch.id,
        name: 'Leaf',
      })).body;

      await request(app.getHttpServer())
        .delete(`/api/folders/${branch.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(await prisma.folder.findUnique({ where: { id: branch.id } })).toBeNull();
      expect(await prisma.folder.findUnique({ where: { id: leaf.id } })).toBeNull();
    });
  });

  describe('Cross-owner access', () => {
    it('404s for another user on every endpoint', async () => {
      const owner = await createUserAndCookie('folder-owner');
      const intruder = await createUserAndCookie('folder-intruder');
      const room = await createRoom(owner.cookie, 'Private Folder Room');
      const child = (await createFolder(owner.cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Secret',
      })).body;

      await request(app.getHttpServer())
        .get(`/api/folders/${child.id}`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/folders/${child.id}/children`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/folders/${child.id}/stats`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/folders/${child.id}`)
        .set('Cookie', intruder.cookie)
        .send({ name: 'Hijacked' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/folders/${child.id}`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await createFolder(
        intruder.cookie,
        { dataRoomId: room.id, parentId: room.rootFolderId, name: 'Intrusion' },
        404,
      );
    });
  });

  describe('Authentication', () => {
    it('401s every mutating endpoint without a session cookie', async () => {
      const { cookie } = await createUserAndCookie('for-401-fixture');
      const room = await createRoom(cookie, 'Fixture Room');
      const child = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Child',
      })).body;

      await request(app.getHttpServer())
        .post('/api/folders')
        .send({ dataRoomId: room.id, parentId: room.rootFolderId, name: 'x' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/folders/${child.id}`)
        .send({ name: 'x' })
        .expect(401);
      await request(app.getHttpServer()).delete(`/api/folders/${child.id}`).expect(401);
    });

    // `get`/`children`/`stats` are deliberately reachable without a session cookie —
    // see ARCHITECTURE.md §4's public-link sharing. A caller with no cookie is
    // anonymous, not unauthorized; without a matching public share, the resource is 404
    // (not 401 or 403), identical to any other resource an anonymous caller can't see.
    // Positive anonymous-access coverage (an active public share succeeding) lives in
    // shares.e2e.spec.ts.
    it('404s (not 401) get/children/stats without a session cookie and no public share', async () => {
      const { cookie } = await createUserAndCookie('for-anon-404-fixture');
      const room = await createRoom(cookie, 'Fixture Room');
      const child = (await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Child',
      })).body;

      await request(app.getHttpServer()).get(`/api/folders/${child.id}`).expect(404);
      await request(app.getHttpServer())
        .get(`/api/folders/${child.id}/children`)
        .expect(404);
      await request(app.getHttpServer()).get(`/api/folders/${child.id}/stats`).expect(404);
    });
  });
});
