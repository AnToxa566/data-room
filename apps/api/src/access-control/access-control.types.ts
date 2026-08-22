import type { ShareResourceType, ShareRole } from '@dataroom/database';

/**
 * What a user can do with a resource. `null` means "cannot see it" — resolved the same
 * way whether the resource doesn't exist or exists but isn't shared with them; see
 * `AccessControlService`'s doc comment for why that's deliberate.
 *
 * `OWNER` is strictly stronger than any `ShareRole`. `OWNER` only ever comes from
 * matching `DataRoom.ownerId`; `VIEWER`/`EDITOR` come from a `Share` — direct, inherited
 * from an ancestor folder, inherited from the Data Room, or a public link — resolved by
 * `AccessControlService`. Nothing outside that class needs to know which.
 */
export type AccessLevel = 'OWNER' | ShareRole | null;

/** Total order over non-null access levels, strongest last. Never compare levels with
 * `===` beyond equality — use this rank to ask "at least as strong as". */
export const ACCESS_RANK: Record<Exclude<AccessLevel, null>, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

/**
 * A non-owner caller's "virtual root" for a resource — which share is widest (see
 * `AccessControlService.resolveShareContext`), and who created it. `isOwner: true`
 * carries no boundary/attribution (the owner's own tree has neither).
 */
export type ShareContext =
  | { isOwner: true; sharedByEmail: null; sharedRootType: null; sharedRootId: null }
  | {
      isOwner: false;
      sharedByEmail: string;
      sharedRootType: ShareResourceType;
      sharedRootId: string;
    };
