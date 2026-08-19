import type { User as ContractUser } from '@dataroom/contracts';
import type { User as PrismaUser } from '@dataroom/database';

/**
 * The only place a Prisma `User` is allowed to become a wire response. Picks fields
 * explicitly rather than spreading — `passwordHash` (and `googleId`, an internal
 * provider identifier) must never reach a response body, and an explicit pick makes
 * that a property of this function rather than something every call site has to
 * remember. See ARCHITECTURE.md §2 and AGENTS.md's `GET /api/auth/me` requirement.
 */
export function toUserDto(user: PrismaUser): ContractUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
