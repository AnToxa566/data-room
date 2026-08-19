/**
 * `GCS_PRIVATE_KEY` arrives from the environment as a single-line value with literal
 * `\n` escapes standing in for real newlines — a raw multi-line PEM block doesn't survive
 * `.env` files or most secret managers intact. PEM parsing needs actual newline
 * characters; skip this conversion and the key fails deep inside `google-auth-library`
 * with an opaque `error:1E08010C:DECODER routines::unsupported` instead of a message that
 * points at the cause. See AGENTS.md's iteration 4 instructions and StorageService.
 */
export function normalizePrivateKey(rawKey: string): string {
  return rawKey.replace(/\\n/g, '\n');
}
