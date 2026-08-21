import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import request from 'supertest';

// See the identical comment in ../support/test-app.ts — documented exception to
// `@nx/enforce-module-boundaries`'s "no app imports" default, per ARCHITECTURE.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  GoogleProfile,
  PrismaService,
  SESSION_COOKIE_NAME,
} from '@dataroom/api';

import { createTestApp, TestApp } from '../support/test-app.js';

/**
 * Supertest against the real (in-process) Nest application — see
 * apps/api-e2e/src/support/test-app.ts for why only `GoogleAuthGuard` is mocked and
 * everything downstream (AuthService, PrismaService, the database) is exercised for
 * real. Runs against the project's actual Postgres instance; every fixture uses a
 * randomly-suffixed email/googleId and is deleted in `afterEach`, so repeat runs never
 * collide with leftover data.
 */
describe('Auth (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const pendingUserIds: string[] = [];
  const pendingShareIds: string[] = [];

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
    if (pendingShareIds.length) {
      await prisma.share.deleteMany({ where: { id: { in: pendingShareIds.splice(0) } } });
    }
    if (pendingUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: pendingUserIds.splice(0) } } });
    }
  });

  function uniqueEmail(label: string): string {
    return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  }

  async function seedUser() {
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail('seed'),
        googleId: `google-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: 'E2E Seed User',
      },
    });
    pendingUserIds.push(user.id);
    return user;
  }

  function sessionCookieFor(
    user: { id: string; email: string },
    expiresIn?: number,
  ): string {
    const token = jwtService.sign(
      { sub: user.id, email: user.email },
      expiresIn === undefined ? undefined : { expiresIn },
    );
    return `${SESSION_COOKIE_NAME}=${token}`;
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

  describe('GET /api/auth/me', () => {
    it('401s when unauthenticated', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('200s with the user, and never serializes passwordHash, for a valid session', async () => {
      const user = await seedUser();

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', sessionCookieFor(user))
        .expect(200);

      expect(res.body).toMatchObject({ id: user.id, email: user.email });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(Object.keys(res.body).sort()).toEqual(
        ['avatarUrl', 'createdAt', 'email', 'id', 'name', 'updatedAt'].sort(),
      );
    });

    it('401s for a tampered token', async () => {
      const user = await seedUser();
      const validCookie = sessionCookieFor(user);
      const tamperedCookie =
        validCookie.slice(0, -1) + (validCookie.endsWith('a') ? 'b' : 'a');

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', tamperedCookie)
        .expect(401);
    });

    it('401s for an expired token', async () => {
      const user = await seedUser();
      const expiredCookie = sessionCookieFor(user, -10);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', expiredCookie)
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('204s, clears the cookie, and a subsequent me() 401s', async () => {
      const user = await seedUser();

      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', sessionCookieFor(user))
        .expect(204);

      const setCookieHeader = logoutRes.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const clearedCookie = Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : setCookieHeader;
      // Cleared with an empty value and the same httpOnly attribute it was set with.
      expect(clearedCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
      expect(clearedCookie.toLowerCase()).toContain('httponly');

      // A real browser simply stops sending a cookie once cleared.
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('rejects an unverified email — no user row is created', async () => {
      const email = uniqueEmail('unverified');
      testApp.setGoogleProfile(googleProfile({ email, emailVerified: false }));

      const res = await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);

      expect(res.headers.location).toContain('error=unverified_email');
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('logs a new user in and sets the session cookie', async () => {
      const email = uniqueEmail('new-user');
      testApp.setGoogleProfile(googleProfile({ email }));

      const res = await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);

      expect(res.headers.location).not.toContain('error=');
      const setCookieHeader = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      expect(cookies.some((c) => c?.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
      if (user) pendingUserIds.push(user.id);
    });

    it('does not create a duplicate row for a returning user', async () => {
      const profile = googleProfile({ email: uniqueEmail('returning') });

      testApp.setGoogleProfile(profile);
      await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);

      testApp.setGoogleProfile(profile);
      await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);

      const users = await prisma.user.findMany({ where: { email: profile.email } });
      expect(users).toHaveLength(1);
      pendingUserIds.push(...users.map((u) => u.id));
    });

    it('resolves a pending share invitation on a verified login', async () => {
      const inviter = await seedUser();
      const inviteeEmail = uniqueEmail('invitee');

      const share = await prisma.share.create({
        data: {
          resourceType: 'DATA_ROOM',
          resourceId: '00000000-0000-0000-0000-000000000000',
          role: 'VIEWER',
          mode: 'EMAIL',
          granteeEmail: inviteeEmail,
          createdById: inviter.id,
        },
      });
      pendingShareIds.push(share.id);

      testApp.setGoogleProfile(googleProfile({ email: inviteeEmail, emailVerified: true }));
      await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);

      const invitee = await prisma.user.findUnique({ where: { email: inviteeEmail } });
      expect(invitee).not.toBeNull();
      if (invitee) pendingUserIds.push(invitee.id);

      const resolvedShare = await prisma.share.findUnique({ where: { id: share.id } });
      expect(resolvedShare?.granteeUserId).toBe(invitee?.id);
    });

    it('does not resolve a pending invitation when the email is unverified', async () => {
      const inviter = await seedUser();
      const inviteeEmail = uniqueEmail('unverified-invitee');

      const share = await prisma.share.create({
        data: {
          resourceType: 'DATA_ROOM',
          resourceId: '00000000-0000-0000-0000-000000000000',
          role: 'VIEWER',
          mode: 'EMAIL',
          granteeEmail: inviteeEmail,
          createdById: inviter.id,
        },
      });
      pendingShareIds.push(share.id);

      testApp.setGoogleProfile(googleProfile({ email: inviteeEmail, emailVerified: false }));
      await request(app.getHttpServer())
        .get('/api/auth/google/callback?code=fake&state=fake')
        .expect(302);

      const resolvedShare = await prisma.share.findUnique({ where: { id: share.id } });
      expect(resolvedShare?.granteeUserId).toBeNull();
      expect(await prisma.user.findUnique({ where: { email: inviteeEmail } })).toBeNull();
    });
  });
});
