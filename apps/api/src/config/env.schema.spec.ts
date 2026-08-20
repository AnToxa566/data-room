import { validateEnv } from './env.schema.js';

/** Every field with no `.default()` in env.schema.ts, filled with a minimal valid value. */
function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:6543/postgres?pgbouncer=true',
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
    WEB_APP_URL: 'http://localhost:4200',
    CORS_ORIGINS: 'http://localhost:4200',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    COOKIE_SECURE: 'false',
    COOKIE_SAME_SITE: 'lax',
    GCS_PROJECT_ID: 'test-project',
    GCS_BUCKET_NAME: 'test-bucket',
    ...overrides,
  };
}

describe('validateEnv — GCS_CLIENT_EMAIL / GCS_PRIVATE_KEY', () => {
  it('does not throw when both are set (explicit credentials — local dev)', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          GCS_CLIENT_EMAIL: 'sa@test-project.iam.gserviceaccount.com',
          GCS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
        }),
      ),
    ).not.toThrow();
  });

  it('does not throw when neither is set (ADC — production)', () => {
    expect(() => validateEnv(baseEnv())).not.toThrow();
  });

  it('throws when only GCS_CLIENT_EMAIL is set', () => {
    expect(() =>
      validateEnv(baseEnv({ GCS_CLIENT_EMAIL: 'sa@test-project.iam.gserviceaccount.com' })),
    ).toThrow(/must be set together/);
  });

  it('throws when only GCS_PRIVATE_KEY is set', () => {
    expect(() =>
      validateEnv(baseEnv({ GCS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n' })),
    ).toThrow(/must be set together/);
  });

  it('throws via the plain non-empty message, not the mismatch one, when set to an empty string', () => {
    // GCS_CLIENT_EMAIL="" is a defined-but-empty value, not "unset" — the field-level
    // .min(1) check fires; the superRefine sees both sides as falsy, so it stays quiet
    // rather than adding a second, confusing "exactly one set" issue.
    expect(() => validateEnv(baseEnv({ GCS_CLIENT_EMAIL: '' }))).toThrow(
      /GCS_CLIENT_EMAIL, if set, must be non-empty/,
    );
  });
});
