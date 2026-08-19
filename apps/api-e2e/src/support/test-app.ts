import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
// `@nx/enforce-module-boundaries` blocks importing any `app`-typed project on
// principle — apps are normally leaf nodes, not libraries. This one import is the
// documented exception: ARCHITECTURE.md's dependency table explicitly allows
// `apps/api-e2e -> apps/api` so e2e tests can boot the real module graph in-process
// instead of driving a separately served instance. See apps/api/src/index.ts.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  AppModule,
  configureApp,
  GoogleAuthGuard,
  GoogleProfile,
} from '@dataroom/api';

/**
 * Boots the real `AppModule` in-process — no `nx serve`, no live port — and applies the
 * exact same middleware/pipes `main.ts` does via `configureApp`, so these tests exercise
 * the same request pipeline production traffic does.
 *
 * `GoogleAuthGuard` is the one thing overridden: it wraps the real Google OAuth
 * handshake, which needs a live round trip to Google. Overriding it lets tests drive
 * `GET /auth/google/callback` with a controlled profile via `setGoogleProfile`, while
 * everything downstream of it — `AuthService.loginWithGoogleProfile`, the user
 * upsert, pending-share resolution, cookie issuance — runs for real against the
 * database. See ARCHITECTURE.md §2 for why this can import `@dataroom/api` directly.
 */
export interface TestApp {
  app: INestApplication;
  moduleRef: TestingModule;
  /** Set the profile the next `GET /auth/google/callback` request will receive as
   * `req.user`, as if `GoogleStrategy.validate()` had produced it. */
  setGoogleProfile(profile: GoogleProfile | null): void;
}

export async function createTestApp(): Promise<TestApp> {
  let currentProfile: GoogleProfile | null = null;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(GoogleAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (!currentProfile) {
          throw new Error(
            'GoogleAuthGuard was invoked but no test called setGoogleProfile() first',
          );
        }
        const request = context.switchToHttp().getRequest();
        request.user = currentProfile;
        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    moduleRef,
    setGoogleProfile: (profile) => {
      currentProfile = profile;
    },
  };
}
