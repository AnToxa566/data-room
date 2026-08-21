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
describe('Data Rooms (e2e)', () => {
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
    // DataRoom -> Folder/File cascades via the FK constraints already in the schema
    // (ARCHITECTURE.md §4), so deleting the room is enough.
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
    return res.body;
  }

  describe('POST /api/data-rooms', () => {
    it('creates the room and its root folder transactionally', async () => {
      const { cookie } = await createUserAndCookie('create');

      const room = await createRoom(cookie, 'Due Diligence Room');

      expect(room.name).toBe('Due Diligence Room');
      expect(room.rootFolderId).toEqual(expect.any(String));

      const rootFolder = await prisma.folder.findUnique({
        where: { id: room.rootFolderId },
      });
      expect(rootFolder).not.toBeNull();
      expect(rootFolder?.parentId).toBeNull();
      expect(rootFolder?.path).toBe(`/${room.rootFolderId}/`);
      expect(rootFolder?.depth).toBe(0);
    });
  });

  describe('Cross-owner access', () => {
    it('404s on GET, PATCH, and DELETE for another user\'s room', async () => {
      const owner = await createUserAndCookie('owner');
      const intruder = await createUserAndCookie('intruder');
      const room = await createRoom(owner.cookie, 'Private Room');

      await request(app.getHttpServer())
        .get(`/api/data-rooms/${room.id}`)
        .set('Cookie', intruder.cookie)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/data-rooms/${room.id}`)
        .set('Cookie', intruder.cookie)
        .send({ name: 'Hijacked' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/data-rooms/${room.id}`)
        .set('Cookie', intruder.cookie)
        .expect(404);

      // Untouched by the intruder's failed attempts.
      const stillThere = await prisma.dataRoom.findUnique({ where: { id: room.id } });
      expect(stillThere?.name).toBe('Private Room');
    });
  });

  describe('GET /api/data-rooms', () => {
    it('returns only the caller\'s rooms', async () => {
      const mine = await createUserAndCookie('list-mine');
      const theirs = await createUserAndCookie('list-theirs');

      const roomA = await createRoom(mine.cookie, 'Mine A');
      const roomB = await createRoom(mine.cookie, 'Mine B');
      await createRoom(theirs.cookie, 'Not Mine');

      const res = await request(app.getHttpServer())
        .get('/api/data-rooms')
        .set('Cookie', mine.cookie)
        .expect(200);

      const ids = res.body.items.map((item: { id: string }) => item.id);
      expect(ids.sort()).toEqual([roomA.id, roomB.id].sort());
      expect(res.body.items.every((item: { access: string }) => item.access === 'OWNER')).toBe(
        true,
      );
    });
  });

  describe('DELETE /api/data-rooms/:id', () => {
    it('cascades — folders in the room are gone afterwards', async () => {
      const { cookie } = await createUserAndCookie('delete-cascade');
      const room = await createRoom(cookie, 'To Be Deleted');

      const child = await request(app.getHttpServer())
        .post('/api/folders')
        .set('Cookie', cookie)
        .send({ dataRoomId: room.id, parentId: room.rootFolderId, name: 'Child' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/data-rooms/${room.id}`)
        .set('Cookie', cookie)
        .expect(200);
      // Cascaded — remove from the cleanup list so afterEach doesn't try again.
      pendingDataRoomIds.splice(pendingDataRoomIds.indexOf(room.id), 1);

      expect(await prisma.dataRoom.findUnique({ where: { id: room.id } })).toBeNull();
      expect(
        await prisma.folder.findUnique({ where: { id: room.rootFolderId } }),
      ).toBeNull();
      expect(await prisma.folder.findUnique({ where: { id: child.body.id } })).toBeNull();
    });
  });

  describe('Authentication', () => {
    it('401s every mutating/listing endpoint without a session cookie', async () => {
      const { cookie } = await createUserAndCookie('for-401-fixture');
      const room = await createRoom(cookie, 'Fixture Room');

      await request(app.getHttpServer())
        .post('/api/data-rooms')
        .send({ name: 'x' })
        .expect(401);
      await request(app.getHttpServer()).get('/api/data-rooms').expect(401);
      await request(app.getHttpServer())
        .patch(`/api/data-rooms/${room.id}`)
        .send({ name: 'x' })
        .expect(401);
      await request(app.getHttpServer()).delete(`/api/data-rooms/${room.id}`).expect(401);
    });

    // `GET /data-rooms/:id` is deliberately reachable without a session cookie — see
    // ARCHITECTURE.md §4's public-link sharing. A caller with no cookie is anonymous,
    // not unauthorized; without a matching public share, the resource is 404 (not
    // 401 or 403) — identical to any other resource an anonymous caller can't see, per
    // ARCHITECTURE.md's "invisible resource" rule. Positive anonymous-access coverage
    // (an active public share succeeding) lives in shares.e2e.spec.ts.
    it('404s (not 401) GET /data-rooms/:id without a session cookie and no public share', async () => {
      const { cookie } = await createUserAndCookie('for-anon-404-fixture');
      const room = await createRoom(cookie, 'Fixture Room');

      await request(app.getHttpServer()).get(`/api/data-rooms/${room.id}`).expect(404);
    });
  });
});
