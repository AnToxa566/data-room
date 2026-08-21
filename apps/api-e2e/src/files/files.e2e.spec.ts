import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import request from 'supertest';

// See the identical comment in ../support/test-app.ts — documented exception to
// `@nx/enforce-module-boundaries`'s "no app imports" default, per ARCHITECTURE.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PrismaService } from '@dataroom/api';

import { createTestApp, MockStorageService, TestApp } from '../support/test-app.js';
import { seedUser, sessionCookieFor } from '../support/fixtures.js';

/**
 * Supertest against the real (in-process) Nest application — see
 * apps/api-e2e/src/support/test-app.ts for why only `GoogleAuthGuard` and
 * `StorageService` are mocked and everything else (services, PrismaService, the
 * database) runs for real. `StorageService`'s own signed-URL generation is exercised
 * against the real GCS client in apps/api/src/storage/storage.service.spec.ts — not
 * here. See AGENTS.md's iteration 4 instructions.
 */
describe('Files (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let storage: MockStorageService;

  const pendingUserIds: string[] = [];
  const pendingDataRoomIds: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.moduleRef.get(PrismaService);
    jwtService = testApp.moduleRef.get(JwtService);
    storage = testApp.storage;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    testApp.resetStorageMocks();
    // DataRoom -> Folder -> File cascades via the FK constraints already in the schema
    // (ARCHITECTURE.md §4), so deleting the room is enough to clean up everything in it.
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

  function uploadUrlBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      ...overrides,
    };
  }

  async function requestUploadUrl(
    cookie: string,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) {
    return request(app.getHttpServer())
      .post('/api/files/upload-url')
      .set('Cookie', cookie)
      .send(body)
      .expect(expectedStatus);
  }

  async function complete(cookie: string, fileId: string, expectedStatus = 200) {
    return request(app.getHttpServer())
      .post(`/api/files/${fileId}/complete`)
      .set('Cookie', cookie)
      .expect(expectedStatus);
  }

  /** Runs the full two-phase upload against the mocked StorageService and returns the
   * resulting READY file DTO. */
  async function uploadReadyFile(
    cookie: string,
    folderId: string,
    name: string,
    opts: { size?: number; mimeType?: string } = {},
  ) {
    const mimeType = opts.mimeType ?? 'application/pdf';
    const size = opts.size ?? 1024;
    const created = await requestUploadUrl(cookie, uploadUrlBody({ folderId, name, mimeType, size }));
    storage.getObjectMetadata.mockResolvedValueOnce({ size, contentType: mimeType });
    const res = await complete(cookie, created.body.fileId as string);
    return res.body as {
      id: string;
      name: string;
      size: string;
      mimeType: string;
      status: string;
      folderId: string;
    };
  }

  describe('POST /api/files/upload-url', () => {
    it('creates a PENDING row and returns a signed URL', async () => {
      const { cookie } = await createUserAndCookie('upload');
      const room = await createRoom(cookie, 'Upload Room');

      const res = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId }),
      );

      expect(res.body.fileId).toEqual(expect.any(String));
      expect(res.body.uploadUrl).toEqual(expect.any(String));
      expect(res.body.expiresAt).toEqual(expect.any(String));

      const row = await prisma.file.findUnique({ where: { id: res.body.fileId } });
      expect(row?.status).toBe('PENDING');
      expect(row?.size).toBe(0n);
      expect(row?.storageKey).toBe(`datarooms/${room.id}/${res.body.fileId}`);
      expect(storage.getSignedUploadUrl).toHaveBeenCalledWith(
        row?.storageKey,
        'application/pdf',
        expect.any(Number),
      );
    });

    it('413s a declared size over MAX_FILE_SIZE_BYTES', async () => {
      const { cookie } = await createUserAndCookie('oversized');
      const room = await createRoom(cookie, 'Oversized Room');

      await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId, size: 200 * 1024 * 1024 }),
        413,
      );
    });

    it('400s a disallowed mimeType', async () => {
      const { cookie } = await createUserAndCookie('bad-mime');
      const room = await createRoom(cookie, 'Bad Mime Room');

      await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId, mimeType: 'application/x-evil' }),
        400,
      );
    });

    it('409s a duplicate name against a fresh PENDING row', async () => {
      const { cookie } = await createUserAndCookie('dup-fresh');
      const room = await createRoom(cookie, 'Dup Fresh Room');

      await requestUploadUrl(cookie, uploadUrlBody({ folderId: room.rootFolderId }));
      await requestUploadUrl(cookie, uploadUrlBody({ folderId: room.rootFolderId }), 409);
    });

    it('replaces a stale PENDING row on a duplicate name, deleting its blob', async () => {
      const { cookie } = await createUserAndCookie('dup-stale');
      const room = await createRoom(cookie, 'Dup Stale Room');

      const first = await requestUploadUrl(cookie, uploadUrlBody({ folderId: room.rootFolderId }));
      // Backdate past PENDING_TTL_MINUTES (default 60) to simulate an abandoned upload.
      await prisma.file.update({
        where: { id: first.body.fileId },
        data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });

      const second = await requestUploadUrl(cookie, uploadUrlBody({ folderId: room.rootFolderId }));

      expect(second.body.fileId).not.toBe(first.body.fileId);
      expect(await prisma.file.findUnique({ where: { id: first.body.fileId } })).toBeNull();
      expect(await prisma.file.findUnique({ where: { id: second.body.fileId } })).not.toBeNull();
      expect(storage.deleteObject).toHaveBeenCalledWith(
        `datarooms/${room.id}/${first.body.fileId}`,
      );
    });
  });

  describe('POST /api/files/:id/complete', () => {
    it('sets size and mimeType from the mocked GCS metadata', async () => {
      const { cookie } = await createUserAndCookie('complete');
      const room = await createRoom(cookie, 'Complete Room');
      const created = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId }),
      );

      // The contract accepts no body on this endpoint (see files.ts) — a client-supplied
      // size has nowhere to go. This asserts the persisted values come from GCS, not the
      // 2048 declared at upload-url time.
      storage.getObjectMetadata.mockResolvedValueOnce({
        size: 555_000,
        contentType: 'application/pdf',
      });
      const res = await complete(cookie, created.body.fileId);

      expect(res.body.size).toBe('555000');
      expect(res.body.mimeType).toBe('application/pdf');
      expect(res.body.status).toBe('READY');

      const row = await prisma.file.findUnique({ where: { id: created.body.fileId } });
      expect(row?.size).toBe(555_000n);
    });

    it('persists the GCS content type even when it differs from the declared mimeType', async () => {
      const { cookie } = await createUserAndCookie('mime-mismatch');
      const room = await createRoom(cookie, 'Mime Mismatch Room');
      const created = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId, mimeType: 'application/pdf' }),
      );

      storage.getObjectMetadata.mockResolvedValueOnce({
        size: 10,
        contentType: 'application/octet-stream',
      });
      const res = await complete(cookie, created.body.fileId);

      expect(res.body.mimeType).toBe('application/octet-stream');
    });

    it('400s when the object is absent from storage; the row stays PENDING', async () => {
      const { cookie } = await createUserAndCookie('absent-object');
      const room = await createRoom(cookie, 'Absent Object Room');
      const created = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId }),
      );

      storage.getObjectMetadata.mockResolvedValueOnce(null);
      await complete(cookie, created.body.fileId, 400);

      const row = await prisma.file.findUnique({ where: { id: created.body.fileId } });
      expect(row?.status).toBe('PENDING');
    });

    it('400s on a second call — never corrupts state', async () => {
      const { cookie } = await createUserAndCookie('complete-twice');
      const room = await createRoom(cookie, 'Complete Twice Room');
      const created = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId }),
      );

      storage.getObjectMetadata.mockResolvedValueOnce({
        size: 100,
        contentType: 'application/pdf',
      });
      const first = await complete(cookie, created.body.fileId);
      await complete(cookie, created.body.fileId, 400);

      const row = await prisma.file.findUnique({ where: { id: created.body.fileId } });
      expect(row?.status).toBe('READY');
      expect(row?.size).toBe(100n);
      expect(first.body.size).toBe('100');
    });
  });

  describe('GET /api/files/:id/download-url', () => {
    it('400s for a PENDING file', async () => {
      const { cookie } = await createUserAndCookie('download-pending');
      const room = await createRoom(cookie, 'Download Pending Room');
      const created = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId }),
      );

      await request(app.getHttpServer())
        .get(`/api/files/${created.body.fileId}/download-url`)
        .set('Cookie', cookie)
        .expect(400);
    });

    it('returns a signed url and expiresAt for a READY file', async () => {
      const { cookie } = await createUserAndCookie('download-ready');
      const room = await createRoom(cookie, 'Download Ready Room');
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'view.pdf');

      const res = await request(app.getHttpServer())
        .get(`/api/files/${file.id}/download-url`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.url).toEqual(expect.any(String));
      expect(res.body.expiresAt).toEqual(expect.any(String));
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
        `datarooms/${room.id}/${file.id}`,
        'view.pdf',
        'application/pdf',
        expect.any(Number),
      );
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('cancels a PENDING upload — 204, and the name is free again', async () => {
      const { cookie } = await createUserAndCookie('cancel');
      const room = await createRoom(cookie, 'Cancel Room');
      const created = await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId, name: 'cancel-me.pdf' }),
      );

      await request(app.getHttpServer())
        .delete(`/api/files/${created.body.fileId}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(await prisma.file.findUnique({ where: { id: created.body.fileId } })).toBeNull();

      // The name is free — a fresh upload-url for it succeeds without a 409.
      await requestUploadUrl(
        cookie,
        uploadUrlBody({ folderId: room.rootFolderId, name: 'cancel-me.pdf' }),
      );
    });

    it('deletes a READY file — database first, then the blob', async () => {
      const { cookie } = await createUserAndCookie('delete-ready');
      const room = await createRoom(cookie, 'Delete Ready Room');
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'delete-me.pdf');

      await request(app.getHttpServer())
        .delete(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(await prisma.file.findUnique({ where: { id: file.id } })).toBeNull();
      expect(storage.deleteObject).toHaveBeenCalledWith(`datarooms/${room.id}/${file.id}`);
    });
  });

  describe('PATCH /api/files/:id', () => {
    it('renames, 409s on a name already taken in the same folder', async () => {
      const { cookie } = await createUserAndCookie('rename');
      const room = await createRoom(cookie, 'Rename Room');
      await uploadReadyFile(cookie, room.rootFolderId, 'taken.pdf');
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'free.pdf');

      await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .send({ name: 'taken.pdf' })
        .expect(409);

      const res = await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .send({ name: 'renamed.pdf' })
        .expect(200);
      expect(res.body.name).toBe('renamed.pdf');
    });

    it('moves within the same Data Room', async () => {
      const { cookie } = await createUserAndCookie('move');
      const room = await createRoom(cookie, 'Move Room');
      const target = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Target',
      });
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'move-me.pdf');

      const res = await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .send({ folderId: target.id })
        .expect(200);

      expect(res.body.folderId).toBe(target.id);
    });

    it('400s moving to a folder in a different Data Room', async () => {
      const { cookie } = await createUserAndCookie('move-cross-room');
      const roomA = await createRoom(cookie, 'Room A');
      const roomB = await createRoom(cookie, 'Room B');
      const file = await uploadReadyFile(cookie, roomA.rootFolderId, 'cross-room.pdf');

      await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .send({ folderId: roomB.rootFolderId })
        .expect(400);
    });

    it('409s moving to a folder whose name is already taken', async () => {
      const { cookie } = await createUserAndCookie('move-conflict');
      const room = await createRoom(cookie, 'Move Conflict Room');
      const target = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Target',
      });
      await uploadReadyFile(cookie, target.id, 'collision.pdf');
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'collision.pdf');

      await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .send({ folderId: target.id })
        .expect(409);
    });

    it('causes zero StorageService calls for a move+rename', async () => {
      const { cookie } = await createUserAndCookie('no-storage-calls');
      const room = await createRoom(cookie, 'No Storage Calls Room');
      const target = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Target',
      });
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'silent.pdf');

      testApp.resetStorageMocks();
      await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', cookie)
        .send({ name: 'renamed-silent.pdf', folderId: target.id })
        .expect(200);

      expect(storage.getSignedUploadUrl).not.toHaveBeenCalled();
      expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
      expect(storage.getObjectMetadata).not.toHaveBeenCalled();
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(storage.deleteByPrefix).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/folders/:id/children', () => {
    it('lists only READY files, folders before files, and pages correctly through both kinds', async () => {
      const { cookie } = await createUserAndCookie('children-mixed');
      const room = await createRoom(cookie, 'Children Mixed Room');
      const parent = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Parent',
      });

      const folderNames = ['folder-a', 'folder-b', 'folder-c'];
      for (const name of folderNames) {
        await createFolder(cookie, { dataRoomId: room.id, parentId: parent.id, name });
      }
      const fileNames = ['file-a.pdf', 'file-b.pdf', 'file-c.pdf', 'file-d.pdf'];
      for (const name of fileNames) {
        await uploadReadyFile(cookie, parent.id, name);
      }
      // A PENDING file must never appear in the listing.
      await requestUploadUrl(cookie, uploadUrlBody({ folderId: parent.id, name: 'pending.pdf' }));

      const seenFolders: string[] = [];
      const seenFiles: string[] = [];
      let sawAFileBeforeAllFolders = false;
      let cursor: string | null = null;
      let pageCount = 0;
      do {
        const res = await request(app.getHttpServer())
          .get(`/api/folders/${parent.id}/children`)
          .query({ limit: 3, ...(cursor ? { cursor } : {}) })
          .set('Cookie', cookie)
          .expect(200);

        let seenFileThisPage = false;
        for (const item of res.body.items as Array<{ kind: string; name: string }>) {
          if (item.kind === 'folder') {
            if (seenFileThisPage) {
              sawAFileBeforeAllFolders = true;
            }
            seenFolders.push(item.name);
          } else {
            seenFileThisPage = true;
            expect(item.name).not.toBe('pending.pdf');
            seenFiles.push(item.name);
          }
        }
        cursor = res.body.nextCursor;
        pageCount++;
      } while (cursor);

      expect(seenFolders.sort()).toEqual(folderNames.sort());
      expect(seenFiles.sort()).toEqual(fileNames.sort());
      expect(sawAFileBeforeAllFolders).toBe(false);
      // 3 folders + 4 files = 7 items at limit 3 -> at least 3 pages, and folders (3)
      // exactly filling one page exercises the folder/file boundary.
      expect(pageCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GET /api/folders/:id/stats', () => {
    it('counts only READY files, aggregated over the whole subtree', async () => {
      const { cookie } = await createUserAndCookie('stats');
      const room = await createRoom(cookie, 'Stats Room');
      const parent = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Stats Parent',
      });
      const child = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: parent.id,
        name: 'Stats Child',
      });

      await uploadReadyFile(cookie, parent.id, 'a.pdf', { size: 1000 });
      await uploadReadyFile(cookie, child.id, 'b.pdf', { size: 2000 });
      // PENDING — must not count.
      await requestUploadUrl(cookie, uploadUrlBody({ folderId: parent.id, name: 'c.pdf', size: 4000 }));

      const res = await request(app.getHttpServer())
        .get(`/api/folders/${parent.id}/stats`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.fileCount).toBe(2);
      expect(res.body.totalSize).toBe('3000');
      expect(res.body.folderCount).toBe(2); // parent itself + child
    });
  });

  describe('DELETE /api/folders/:id', () => {
    it('deletes the subtree\'s blobs', async () => {
      const { cookie } = await createUserAndCookie('delete-folder-blobs');
      const room = await createRoom(cookie, 'Delete Folder Blobs Room');
      const branch = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: room.rootFolderId,
        name: 'Branch',
      });
      const leaf = await createFolder(cookie, {
        dataRoomId: room.id,
        parentId: branch.id,
        name: 'Leaf',
      });
      const fileInBranch = await uploadReadyFile(cookie, branch.id, 'in-branch.pdf');
      const fileInLeaf = await uploadReadyFile(cookie, leaf.id, 'in-leaf.pdf');

      testApp.resetStorageMocks();
      await request(app.getHttpServer())
        .delete(`/api/folders/${branch.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(storage.deleteObject).toHaveBeenCalledWith(`datarooms/${room.id}/${fileInBranch.id}`);
      expect(storage.deleteObject).toHaveBeenCalledWith(`datarooms/${room.id}/${fileInLeaf.id}`);
      expect(await prisma.file.findUnique({ where: { id: fileInBranch.id } })).toBeNull();
      expect(await prisma.file.findUnique({ where: { id: fileInLeaf.id } })).toBeNull();
    });
  });

  describe('DELETE /api/data-rooms/:id', () => {
    it('deletes the whole room by prefix', async () => {
      const { cookie } = await createUserAndCookie('delete-room-blobs');
      const room = await createRoom(cookie, 'Delete Room Blobs Room');
      await uploadReadyFile(cookie, room.rootFolderId, 'in-room.pdf');

      testApp.resetStorageMocks();
      await request(app.getHttpServer())
        .delete(`/api/data-rooms/${room.id}`)
        .set('Cookie', cookie)
        .expect(200);
      pendingDataRoomIds.splice(pendingDataRoomIds.indexOf(room.id), 1);

      expect(storage.deleteByPrefix).toHaveBeenCalledWith(`datarooms/${room.id}/`);
    });
  });

  describe('Cross-owner access', () => {
    it('404s for another user on every endpoint', async () => {
      const owner = await createUserAndCookie('file-owner');
      const intruder = await createUserAndCookie('file-intruder');
      const room = await createRoom(owner.cookie, 'Private File Room');
      const file = await uploadReadyFile(owner.cookie, room.rootFolderId, 'secret.pdf');

      await requestUploadUrl(
        intruder.cookie,
        uploadUrlBody({ folderId: room.rootFolderId, name: 'intrusion.pdf' }),
        404,
      );
      await request(app.getHttpServer())
        .get(`/api/files/${file.id}`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/files/${file.id}/download-url`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/files/${file.id}/complete`)
        .set('Cookie', intruder.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .set('Cookie', intruder.cookie)
        .send({ name: 'hijacked.pdf' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/files/${file.id}`)
        .set('Cookie', intruder.cookie)
        .expect(404);
    });
  });

  describe('Authentication', () => {
    it('401s every mutating endpoint without a session cookie', async () => {
      const { cookie } = await createUserAndCookie('for-401-fixture');
      const room = await createRoom(cookie, 'Fixture Room');
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'fixture.pdf');

      await request(app.getHttpServer())
        .post('/api/files/upload-url')
        .send(uploadUrlBody({ folderId: room.rootFolderId }))
        .expect(401);
      await request(app.getHttpServer()).post(`/api/files/${file.id}/complete`).expect(401);
      await request(app.getHttpServer())
        .patch(`/api/files/${file.id}`)
        .send({ name: 'x' })
        .expect(401);
      await request(app.getHttpServer()).delete(`/api/files/${file.id}`).expect(401);
    });

    // `get`/`downloadUrl` are deliberately reachable without a session cookie — see
    // ARCHITECTURE.md §4's public-link sharing. A caller with no cookie is anonymous,
    // not unauthorized; without a matching public share, the resource is 404 (not 401
    // or 403), identical to any other resource an anonymous caller can't see. Positive
    // anonymous-access coverage (an active public share succeeding) lives in
    // shares.e2e.spec.ts.
    it('404s (not 401) get/download-url without a session cookie and no public share', async () => {
      const { cookie } = await createUserAndCookie('for-anon-404-fixture');
      const room = await createRoom(cookie, 'Fixture Room');
      const file = await uploadReadyFile(cookie, room.rootFolderId, 'fixture.pdf');

      await request(app.getHttpServer()).get(`/api/files/${file.id}`).expect(404);
      await request(app.getHttpServer())
        .get(`/api/files/${file.id}/download-url`)
        .expect(404);
    });
  });
});
