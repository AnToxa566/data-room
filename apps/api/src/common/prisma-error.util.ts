import { Prisma } from '@dataroom/database';

/**
 * Prisma's error code for a unique-constraint violation. Every write that relies on a
 * `UNIQUE` constraint (folder `(parentId, name)`, …) catches this rather than
 * pre-checking with a `SELECT` as its primary mechanism — a pre-check loses the race
 * under concurrent writers. See ARCHITECTURE.md §4.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}
