import { z } from 'zod';

/**
 * Everything this app reads from `process.env`, validated once at startup so a missing
 * or malformed value fails fast (before the first request) rather than surfacing as a
 * confusing runtime error deep inside a request handler.
 *
 * Deliberately scoped to what THIS app's code actually consumes this iteration — no
 * `GCS_*` vars (storage isn't wired up yet) and no `DIRECT_URL` (migrations-only, read
 * by `libs/database/prisma.config.ts`, never by the running app).
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

export const envSchema = z.object({
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
