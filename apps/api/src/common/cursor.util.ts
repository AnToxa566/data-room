import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Opaque keyset-pagination cursors, shared by every cursor-paginated endpoint
 * (`GET /data-rooms`, `GET /folders/:id/children`, …). The cursor is base64url of a
 * small JSON sort-key object — never OFFSET, per ARCHITECTURE.md §7. "Opaque" means the
 * client never parses it; encoding it as base64 rather than a bare JSON string is what
 * keeps that true rather than merely conventional.
 */

/** Encodes a sort-key object into the opaque cursor string returned as `nextCursor`. */
export function encodeCursor(key: unknown): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

/**
 * Decodes and validates a client-supplied `cursor` query param against `schema`.
 * Throws `400` for anything that isn't valid base64url JSON matching the expected
 * shape — a bad cursor is a client error, never a 500 or a silently-ignored filter.
 */
export function decodeCursor<T>(cursor: string, schema: ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed cursor.');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new BadRequestException('Malformed cursor.');
  }
  return result.data;
}
