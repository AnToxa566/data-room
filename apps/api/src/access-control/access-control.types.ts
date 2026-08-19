import type { ShareRole } from '@dataroom/database';

/**
 * What a user can do with a resource. `null` means "cannot see it" — resolved the same
 * way whether the resource doesn't exist or exists but isn't shared with them; see
 * `AccessControlService`'s doc comment for why that's deliberate.
 *
 * `OWNER` is strictly stronger than any `ShareRole`. Iteration 5 adds the second branch
 * that can produce `VIEWER`/`EDITOR` here — nothing outside `AccessControlService`
 * changes when it does.
 */
export type AccessLevel = 'OWNER' | ShareRole | null;

/** Total order over non-null access levels, strongest last. Never compare levels with
 * `===` beyond equality — use this rank to ask "at least as strong as". */
export const ACCESS_RANK: Record<Exclude<AccessLevel, null>, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};
