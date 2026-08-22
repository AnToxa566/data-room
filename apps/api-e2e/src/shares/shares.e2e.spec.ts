import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import request from 'supertest';

// See the identical comment in ../support/test-app.ts — documented exception to
// `@nx/enforce-module-boundaries`'s "no app imports" default, per ARCHITECTURE.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { GoogleProfile, PrismaService, SESSION_COOKIE_NAME } from '@dataroom/api';

import { createTestApp, TestApp } from '../support/test-app.js';
import { seedUser, sessionCookieFor, uniqueEmail } from '../support/fixtures.js';

/**
 * Supertest against the real (in-process) Nest application — see
 * apps/api-e2e/src/support/test-app.ts. Covers `SharesService` (create/list/revoke) and
 * the anonymous-public-link + named-grant read paths this module unlocks in
 * `AccessControlService`, `FoldersController`, `FilesController`, and
 * `DataRoomsController` — see PLAN §3/§5/§6. `AccessControlService`'s own unit and e2e
 * suites cover the resolution algorithm in isolation; this file proves the whole stack
 * composes over real HTTP.
 */
describe('Shares (e2e)', () => {
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
    testApp.resetStorageMocks();
    // DataRoom -> Folder -> File cascades via the FK constraints already in the schema
    // (ARCHITECTURE.md §4), so deleting the room is enough to clean up everything in it,
    // including any Share rows targeting it (Share has no FK to clean up by cascade —
    // it's a flat polymorphic table — but nothing in these tests leaves a dangling Share
    // pointing at a deleted resource; test-scoped resourceIds never repeat).
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
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/folders')
      .set('Cookie', cookie)
      .send(body)
      .expect(201);
    return res.body as { id: string };
  }

  async function uploadReadyFile(cookie: string, folderId: string, name: string) {
    const mimeType = 'application/pdf';
    const size = 1024;
    const created = await request(app.getHttpServer())
      .post('/api/files/upload-url')
      .set('Cookie', cookie)
      .send({ folderId, name, mimeType, size })
      .expect(201);
    testApp.storage.getObjectMetadata.mockResolvedValueOnce({ size, contentType: mimeType });
    const res = await request(app.getHttpServer())
      .post(`/api/files/${created.body.fileId}/complete`)
      .set('Cookie', cookie)
      .expect(200);
    return res.body as { id: string; folderId: string };
  }

  function googleProfile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
    return {
      googleId: `google-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email: uniqueEmail('google'),
      emailVerified: true,
      name: 'Google Test User',
      avatarUrl: null,
      ...overrides,
    };
  }

  describe('POST /api/shares', () => {
    it('creates an EMAIL share — granteeUserId stays null until the invitee logs in', async () => {
      const { cookie } = await createUserAndCookie('share-create-email-owner');
      const room = await createRoom(cookie, 'Room');
      const inviteeEmail = uniqueEmail('invitee');

      const res = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({
          resourceType: 'DATA_ROOM',
          resourceId: room.id,
          mode: 'email',
          granteeEmail: inviteeEmail,
        })
        .expect(201);

      expect(res.body.mode).toBe('EMAIL');
      expect(res.body.role).toBe('VIEWER');
      expect(res.body.granteeEmail).toBe(inviteeEmail.toLowerCase());
      expect(res.body.granteeUserId).toBeNull();
      expect(res.body.revokedAt).toBeNull();
    });

    it('creates a PUBLIC share with no grantee', async () => {
      const { cookie } = await createUserAndCookie('share-create-public-owner');
      const room = await createRoom(cookie, 'Room');

      const res = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'public', role: 'EDITOR' })
        .expect(201);

      expect(res.body.mode).toBe('PUBLIC');
      expect(res.body.role).toBe('EDITOR');
      expect(res.body.granteeEmail).toBeNull();
      expect(res.body.granteeUserId).toBeNull();
    });

    it('404s for a resource the caller does not own', async () => {
      const owner = await createUserAndCookie('share-create-real-owner');
      const other = await createUserAndCookie('share-create-not-owner');
      const room = await createRoom(owner.cookie, 'Room');

      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', other.cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'public' })
        .expect(404);
    });

    it('404s for a resourceId that does not exist', async () => {
      const { cookie } = await createUserAndCookie('share-create-nonexistent');

      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({
          resourceType: 'DATA_ROOM',
          resourceId: '00000000-0000-0000-0000-000000000000',
          mode: 'public',
        })
        .expect(404);
    });
  });

  describe('GET /api/shares', () => {
    it('lists every share on a resource, including revoked ones, for its owner', async () => {
      const { cookie } = await createUserAndCookie('share-list-owner');
      const room = await createRoom(cookie, 'Room');

      const created = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'public' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/shares/${created.body.id}`)
        .set('Cookie', cookie)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/shares')
        .query({ resourceType: 'DATA_ROOM', resourceId: room.id })
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(created.body.id);
      expect(res.body.items[0].revokedAt).not.toBeNull();
    });

    it('404s for a non-owner', async () => {
      const owner = await createUserAndCookie('share-list-real-owner');
      const other = await createUserAndCookie('share-list-not-owner');
      const room = await createRoom(owner.cookie, 'Room');

      await request(app.getHttpServer())
        .get('/api/shares')
        .query({ resourceType: 'DATA_ROOM', resourceId: room.id })
        .set('Cookie', other.cookie)
        .expect(404);
    });
  });

  describe('DELETE /api/shares/:id', () => {
    it('soft-revokes — the share still exists with revokedAt set', async () => {
      const { cookie } = await createUserAndCookie('share-revoke-owner');
      const room = await createRoom(cookie, 'Room');
      const created = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'public' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/shares/${created.body.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.revokedAt).toEqual(expect.any(String));

      const row = await prisma.share.findUnique({ where: { id: created.body.id } });
      expect(row?.revokedAt).not.toBeNull();
    });

    it('404s for a caller with no access at all to the underlying resource', async () => {
      const owner = await createUserAndCookie('share-revoke-real-owner');
      const other = await createUserAndCookie('share-revoke-not-owner');
      const room = await createRoom(owner.cookie, 'Room');
      // An EMAIL share to an unrelated third address — unlike a PUBLIC share, this
      // grants `other` no access at all, so `other` gets 404 (never proved the resource
      // exists), not 403 (which is what a PUBLIC share on the same resource would
      // correctly produce instead, since it would grant `other` VIEWER).
      const created = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', owner.cookie)
        .send({
          resourceType: 'DATA_ROOM',
          resourceId: room.id,
          mode: 'email',
          granteeEmail: uniqueEmail('unrelated-third-party'),
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/shares/${created.body.id}`)
        .set('Cookie', other.cookie)
        .expect(404);
    });

    it('404s for a share id that does not exist', async () => {
      const { cookie } = await createUserAndCookie('share-revoke-nonexistent');

      await request(app.getHttpServer())
        .delete('/api/shares/00000000-0000-0000-0000-000000000000')
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  describe('Anonymous public-link access', () => {
    it('lets a request with no session cookie read a folder, its children, and a file inside it, once a public share exists on the folder', async () => {
      const { cookie } = await createUserAndCookie('anon-public-owner');
      const room = await createRoom(cookie, 'Room');
      const folder = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Shared Folder',
      });
      const file = await uploadReadyFile(cookie, folder.id, 'contract.pdf');

      // No public share yet — anonymous request 404s, same as any other invisible
      // resource.
      await request(app.getHttpServer()).get(`/api/folders/${folder.id}`).expect(404);

      const share = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'FOLDER', resourceId: folder.id, mode: 'public' })
        .expect(201);

      // Now it works — with no Cookie header at all.
      const folderRes = await request(app.getHttpServer())
        .get(`/api/folders/${folder.id}`)
        .expect(200);
      expect(folderRes.body.id).toBe(folder.id);

      const childrenRes = await request(app.getHttpServer())
        .get(`/api/folders/${folder.id}/children`)
        .expect(200);
      expect(childrenRes.body.items.map((item: { id: string }) => item.id)).toContain(file.id);

      // The share is on the folder, not the file — access is inherited down, per
      // ARCHITECTURE.md §4.
      await request(app.getHttpServer()).get(`/api/files/${file.id}`).expect(200);
      await request(app.getHttpServer()).get(`/api/files/${file.id}/download-url`).expect(200);

      // Revoking turns it back off, immediately, for the same anonymous request.
      await request(app.getHttpServer())
        .delete(`/api/shares/${share.body.id}`)
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer()).get(`/api/folders/${folder.id}`).expect(404);
      await request(app.getHttpServer()).get(`/api/files/${file.id}`).expect(404);
    });

    it('never exposes what is above the shared folder to an anonymous visitor', async () => {
      const { cookie, user } = await createUserAndCookie('anon-virtual-root-owner');
      const room = await createRoom(cookie, 'Room');
      const shared = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Shared',
      });
      const nested = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: shared.id,
        name: 'Nested',
      });
      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'FOLDER', resourceId: shared.id, mode: 'public' })
        .expect(201);

      // `breadcrumbs` is truncated server-side to the caller's virtual root — see
      // AccessControlService.resolveShareContext and ARCHITECTURE.md §4 ("breadcrumbs
      // are computed relative to [the shared folder]"). The true ancestors above
      // `shared` (here, the Data Room's own root) must not appear at all, not merely be
      // unreachable if guessed — this is the fix for a real information leak this test
      // previously only partially covered (it used to assert the ancestor id *did*
      // still appear in `breadcrumbs`, just that navigating to it 404s).
      const res = await request(app.getHttpServer())
        .get(`/api/folders/${shared.id}`)
        .expect(200);
      expect(res.body.breadcrumbs).toEqual([{ id: shared.id, name: 'Shared' }]);
      expect(res.body.isOwner).toBe(false);
      expect(res.body.sharedByEmail).toBe(user.email);
      expect(res.body.sharedRootType).toBe('FOLDER');

      // Still true regardless: the Data Room's true root is unreachable directly.
      await request(app.getHttpServer()).get(`/api/folders/${room.rootFolderId}`).expect(404);

      // Navigating *down* into a subfolder of the shared folder keeps the same virtual
      // root — `Shared` stays breadcrumbs[0], never re-derived per request.
      const nestedRes = await request(app.getHttpServer())
        .get(`/api/folders/${nested.id}`)
        .expect(200);
      expect(nestedRes.body.breadcrumbs).toEqual([
        { id: shared.id, name: 'Shared' },
        { id: nested.id, name: 'Nested' },
      ]);
      expect(nestedRes.body.sharedRootType).toBe('FOLDER');
    });

    it('does not truncate breadcrumbs for a Data-Room-level share — the true root is the caller\'s own virtual root', async () => {
      const { cookie } = await createUserAndCookie('anon-dataroom-share-owner');
      const room = await createRoom(cookie, 'Whole Room Shared');
      const child = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Child',
      });
      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'public' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/folders/${child.id}`)
        .expect(200);
      expect(res.body.breadcrumbs).toEqual([
        { id: room.rootFolderId, name: '/' },
        { id: child.id, name: 'Child' },
      ]);
      expect(res.body.isOwner).toBe(false);
      expect(res.body.sharedRootType).toBe('DATA_ROOM');
    });

    it('attributes "Shared by" to the share creator\'s email, on both folders and files', async () => {
      const { cookie, user } = await createUserAndCookie('anon-sharedby-owner');
      const room = await createRoom(cookie, 'Attribution Room');
      const folder = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Attribution Folder',
      });
      const file = await uploadReadyFile(cookie, folder.id, 'terms.pdf');
      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'FOLDER', resourceId: folder.id, mode: 'public' })
        .expect(201);

      const folderRes = await request(app.getHttpServer())
        .get(`/api/folders/${folder.id}`)
        .expect(200);
      expect(folderRes.body.sharedByEmail).toBe(user.email);

      // The file's access is inherited from the folder-level share — its own
      // sharedRootType reflects that (FOLDER, not FILE — no share sits directly on it).
      const fileRes = await request(app.getHttpServer()).get(`/api/files/${file.id}`).expect(200);
      expect(fileRes.body.isOwner).toBe(false);
      expect(fileRes.body.sharedByEmail).toBe(user.email);
      expect(fileRes.body.sharedRootType).toBe('FOLDER');
    });

    it('a FILE-level share does not grant independent access to its containing folder', async () => {
      const { cookie } = await createUserAndCookie('anon-file-share-owner');
      const room = await createRoom(cookie, 'File Share Room');
      const folder = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Not Shared Itself',
      });
      const file = await uploadReadyFile(cookie, folder.id, 'single-file.pdf');
      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', cookie)
        .send({ resourceType: 'FILE', resourceId: file.id, mode: 'public' })
        .expect(201);

      const fileRes = await request(app.getHttpServer()).get(`/api/files/${file.id}`).expect(200);
      expect(fileRes.body.isOwner).toBe(false);
      expect(fileRes.body.sharedRootType).toBe('FILE');

      // The containing folder was never shared on its own — an anonymous visitor who
      // only has the file's link cannot browse into it. This is exactly why
      // `apps/web/src/routes/file-route.tsx` must not attempt to fetch it in this case.
      await request(app.getHttpServer()).get(`/api/folders/${folder.id}`).expect(404);
    });
  });

  describe('Named grant — composes with login (see auth.e2e.spec.ts)', () => {
    it('grants access once the invitee logs in and their email resolves the pending share', async () => {
      const owner = await createUserAndCookie('grant-owner');
      const room = await createRoom(owner.cookie, 'Room');
      const inviteeEmail = uniqueEmail('grant-invitee');

      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', owner.cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'email', granteeEmail: inviteeEmail })
        .expect(201);

      // Not logged in yet — anonymous, and there's no public share, so still 404.
      await request(app.getHttpServer()).get(`/api/data-rooms/${room.id}`).expect(404);

      testApp.setGoogleProfile(googleProfile({ email: inviteeEmail, emailVerified: true }));
      const loginRes = await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);
      const setCookieHeader = loginRes.headers['set-cookie'];
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      const inviteeCookie = cookies.find((c) => c?.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (!inviteeCookie) {
        throw new Error('Login response did not set a session cookie.');
      }
      const invitee = await prisma.user.findUnique({ where: { email: inviteeEmail.toLowerCase() } });
      if (invitee) pendingUserIds.push(invitee.id);

      const res = await request(app.getHttpServer())
        .get(`/api/data-rooms/${room.id}`)
        .set('Cookie', inviteeCookie)
        .expect(200);
      expect(res.body.id).toBe(room.id);

      // A third, unrelated user still can't see it — this was a named grant, not public.
      const stranger = await createUserAndCookie('grant-stranger');
      await request(app.getHttpServer())
        .get(`/api/data-rooms/${room.id}`)
        .set('Cookie', stranger.cookie)
        .expect(404);
    });
  });

  describe('GET /api/data-rooms — shared with me', () => {
    it('includes a Data Room with an active named grant, with the granted role as access', async () => {
      const owner = await createUserAndCookie('list-shared-owner');
      const grantee = await createUserAndCookie('list-shared-grantee');
      const room = await createRoom(owner.cookie, 'Shared With Me');

      const share = await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', owner.cookie)
        .send({
          resourceType: 'DATA_ROOM',
          resourceId: room.id,
          mode: 'email',
          role: 'EDITOR',
          granteeEmail: grantee.user.email,
        })
        .expect(201);
      // Resolving granteeEmail -> granteeUserId normally happens at the grantee's next
      // verified login (see AuthService, and the "Named grant" suite above, which
      // exercises that path for real) — `grantee` here got its session cookie by
      // minting a JWT directly (createUserAndCookie), not by logging in, so resolve it
      // by hand to isolate what this test actually checks: that `list` surfaces an
      // already-resolved grant correctly.
      await prisma.share.update({
        where: { id: share.body.id },
        data: { granteeUserId: grantee.user.id },
      });

      const res = await request(app.getHttpServer())
        .get('/api/data-rooms')
        .set('Cookie', grantee.cookie)
        .expect(200);

      const item = res.body.items.find((i: { id: string }) => i.id === room.id);
      expect(item).toBeDefined();
      expect(item.access).toBe('EDITOR');
    });

    it('does not include a Data Room that only has a PUBLIC share', async () => {
      const owner = await createUserAndCookie('list-public-owner');
      const bystander = await createUserAndCookie('list-public-bystander');
      const room = await createRoom(owner.cookie, 'Public Only');

      await request(app.getHttpServer())
        .post('/api/shares')
        .set('Cookie', owner.cookie)
        .send({ resourceType: 'DATA_ROOM', resourceId: room.id, mode: 'public' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/data-rooms')
        .set('Cookie', bystander.cookie)
        .expect(200);

      expect(res.body.items.some((i: { id: string }) => i.id === room.id)).toBe(false);
    });
  });
});
