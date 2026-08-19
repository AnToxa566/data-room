import type { User as PrismaUser } from '@dataroom/database';

/** JWT payload. Deliberately minimal — no roles, no permissions. Those are resolved per
 * request from the database, never cached in the token. See ARCHITECTURE.md. */
export interface JwtPayload {
  sub: string;
  email: string;
}

/** What `GoogleStrategy.validate()` hands to the callback controller. A thin adapter
 * shape over the raw passport profile — not a Prisma model, not a contract schema. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

/** The authenticated user attached to `request.user` by `JwtStrategy.validate()`. */
export type AuthenticatedUser = PrismaUser;
