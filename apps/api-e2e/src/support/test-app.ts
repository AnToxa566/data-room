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
  StorageService,
} from '@dataroom/api';

/**
 * Every `StorageService` method as a jest mock, with defaults that let a request
 * complete without a test having to stub anything — `getSignedUploadUrl`/
 * `getSignedDownloadUrl` resolve to a fake URL, `deleteObject`/`deleteByPrefix` resolve to
 * `undefined`. `getObjectMetadata` defaults to `null` (object absent) deliberately: a
 * test exercising `complete` must opt in with a real-looking metadata object, so a test
 * that forgets to do so fails loudly (400) instead of silently succeeding with fabricated
 * numbers. See AGENTS.md's iteration 4 instructions.
 */
export interface MockStorageService {
  getSignedUploadUrl: jest.Mock;
  getSignedDownloadUrl: jest.Mock;
  getObjectMetadata: jest.Mock;
  deleteObject: jest.Mock;
  deleteByPrefix: jest.Mock;
}

function createMockStorageService(): MockStorageService {
  return {
    getSignedUploadUrl: jest.fn().mockImplementation((key: string) =>
      Promise.resolve({
        url: `https://storage.example.com/upload/${key}`,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      }),
    ),
    getSignedDownloadUrl: jest.fn().mockImplementation((key: string) =>
      Promise.resolve({
        url: `https://storage.example.com/download/${key}`,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      }),
    ),
    getObjectMetadata: jest.fn().mockResolvedValue(null),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    deleteByPrefix: jest.fn().mockResolvedValue(undefined),
  };
}

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
  /** The mocked `StorageService` — stub a method's return value per-test
   * (`storage.getObjectMetadata.mockResolvedValueOnce(...)`) or assert it was called
   * (`expect(storage.deleteObject).toHaveBeenCalledWith(...)`). */
  storage: MockStorageService;
  /** Clears call history (not stubbed implementations) on every `storage` mock —
   * call in `afterEach` so one spec file's assertions never see another test's calls. */
  resetStorageMocks(): void;
}

export async function createTestApp(): Promise<TestApp> {
  let currentProfile: GoogleProfile | null = null;
  const mockStorage = createMockStorageService();

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
    // Never touch real GCS in e2e — see AGENTS.md's iteration 4 instructions. Signed-URL
    // generation itself (the one thing this mock can't exercise) is unit-tested against
    // the real StorageService in apps/api/src/storage/storage.service.spec.ts.
    .overrideProvider(StorageService)
    .useValue(mockStorage)
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
    storage: mockStorage,
    resetStorageMocks: () => {
      Object.values(mockStorage).forEach((mockFn) => mockFn.mockClear());
    },
  };
}
