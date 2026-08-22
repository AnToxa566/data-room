/**
 * Validates a caller-supplied post-login return path — either the `returnTo` query
 * param on `GET /auth/google`, or the cookie value read back in the callback (see
 * `guards/google-auth.guard.ts`/`auth.controller.ts`). Accepts only an in-app,
 * same-origin relative path. Rejects:
 * - anything not starting with `/`;
 * - `//...` — a protocol-relative URL (`//evil.example` resolves as an absolute
 *   redirect to a different origin in a browser, the classic open-redirect vector);
 * - `/\...` or any embedded backslash — browsers normalize `\` to `/` when resolving a
 *   URL for schemes like http(s), so `/\evil.example` becomes `//evil.example` (the
 *   same protocol-relative bypass) after normalization, even though the raw string
 *   itself starts with a single `/`;
 * - anything containing `://` — an absolute URL smuggled in past the leading-slash
 *   check (e.g. inside a query string, `/redirect?to=https://evil.example`).
 *
 * Returns `null` for anything else, including a missing/non-string value — the caller
 * falls back to the current unconditional redirect target in that case.
 */
export function parseReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('://')
  ) {
    return null;
  }
  return value;
}
