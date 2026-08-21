/** The ts-rest client throws the raw `{ status, body }` result for any non-2xx response
 * (see `api.ts`'s `isTsRestErrorWithStatus` for the same shape read elsewhere) — `body`
 * is `ErrorSchema` (`{ message, ... }`) on every error status these endpoints declare.
 * Shared by every dialog that renders a mutation error inline (create/rename/delete). */
export function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'body' in error &&
    typeof (error as { body?: unknown }).body === 'object' &&
    (error as { body?: { message?: unknown } }).body !== null &&
    typeof (error as { body?: { message?: unknown } }).body?.message === 'string'
  ) {
    return (error as { body: { message: string } }).body.message;
  }
  return 'Something went wrong. Try again.';
}
