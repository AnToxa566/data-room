/**
 * Escapes Postgres `LIKE` metacharacters (`%`, `_`, and the escape character itself,
 * `\`) in a value that will be interpolated into a `LIKE` pattern as a literal prefix.
 *
 * `path` segments are UUIDs today, so none of these characters can actually occur — but
 * a prefix built from unescaped input is a latent bug the moment that stops being true,
 * per AGENTS.md. Postgres's default `LIKE` escape character is already `\`, so no
 * explicit `ESCAPE` clause is needed at the call site once the value is escaped this way.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
