import { z } from 'zod';

/**
 * Everything this app reads from `process.env`, validated once at startup so a missing
 * or malformed value fails fast (before the first request) rather than surfacing as a
 * confusing runtime error deep inside a request handler.
 *
 * Deliberately scoped to what THIS app's code actually consumes — no `DIRECT_URL`
 * (migrations-only, read by `libs/database/prisma.config.ts`, never by the running app).
 *
 * No `.default()` on anything security- or session-relevant (cookie attributes, JWT
 * secret/expiry, CORS origins): a missing value should throw at boot, not silently fall
 * back to a value that happens to be safe in one environment and wrong in another. See
 * README.md "Authentication" and ARCHITECTURE.md's decision log.
 */

const booleanFromEnv = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['true', 'false']))
  .transform((value) => value === 'true');

const commaSeparatedOrigins = z
  .string()
  .min(1, 'CORS_ORIGINS is required — a comma-separated allowlist, never a wildcard')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url()).min(1));

/** Comma-separated list, e.g. `application/pdf,image/png` — kept in config rather than
 * inline in FilesService so the allowlist can be tuned per environment. */
const commaSeparatedMimeTypes = z
  .string()
  .min(1)
  .default('application/pdf')
  .transform((value) =>
    value
      .split(',')
      .map((mimeType) => mimeType.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)).min(1));

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Consumed by PrismaService (libs/database) via process.env directly — validated here
  // too so a missing DATABASE_URL fails at this app's boot, not lazily on first query.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_CALLBACK_URL: z.string().url(),

  WEB_APP_URL: z.string().url(),
  CORS_ORIGINS: commaSeparatedOrigins,

  JWT_SECRET: z.string().min(32, 'JWT_SECRET should be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1),

  COOKIE_SECURE: booleanFromEnv,
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),

  // Read only by StorageService (apps/api/src/storage) — never imported elsewhere, per
  // AGENTS.md's iteration 4 instructions. GCS_PRIVATE_KEY keeps its literal `\n` escapes
  // here; StorageService converts them (see storage/private-key.util.ts) rather than this
  // schema, so the conversion has its own unit test independent of env parsing.
  //
  // GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY are optional: set together, StorageService builds
  // an explicit-credentials client (local dev, where Application Default Credentials
  // aren't available); left unset together, it falls back to ADC and signs via the IAM
  // Credentials API's signBlob (Cloud Run, using the service account's own identity).
  // Setting exactly one is rejected below — see the superRefine on envSchema.
  GCS_PROJECT_ID: z.string().min(1, 'GCS_PROJECT_ID is required'),
  GCS_CLIENT_EMAIL: z
    .string()
    .min(1, 'GCS_CLIENT_EMAIL, if set, must be non-empty')
    .optional(),
  GCS_PRIVATE_KEY: z
    .string()
    .min(1, 'GCS_PRIVATE_KEY, if set, must be non-empty')
    .optional(),
  GCS_BUCKET_NAME: z.string().min(1, 'GCS_BUCKET_NAME is required'),

  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(104_857_600),
  ALLOWED_MIME_TYPES: commaSeparatedMimeTypes,
  UPLOAD_URL_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  DOWNLOAD_URL_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  // How often the PENDING sweep runs, not the age threshold above — see
  // pending-sweep.service.ts. Not in AGENTS.md's fixed env-var list, but "make the
  // interval configurable" (iteration 4 instructions) needs a knob, and every other
  // interval/TTL in this app is env-driven rather than hardcoded.
  PENDING_SWEEP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
});

/**
 * GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY must be set together or both left unset — a
 * half-configured credential is a misconfiguration, not a fallback. See StorageService.
 */
export const envSchema = baseEnvSchema.superRefine((config, ctx) => {
  // Truthy, not `!== undefined`: GCS_CLIENT_EMAIL="" alone should surface only its own
  // .min(1) issue above, not also this "exactly one set" issue.
  const hasClientEmail = Boolean(config.GCS_CLIENT_EMAIL);
  const hasPrivateKey = Boolean(config.GCS_PRIVATE_KEY);
  if (hasClientEmail !== hasPrivateKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasClientEmail ? 'GCS_PRIVATE_KEY' : 'GCS_CLIENT_EMAIL'],
      message:
        'GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY must be set together (explicit ' +
        'service-account credentials — local dev) or both left unset (production — ' +
        'signs via Application Default Credentials and the IAM Credentials API). ' +
        'Exactly one is set, which is not a valid configuration.',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Passed as `ConfigModule.forRoot({ validate })` — throws on the first bad env var. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
