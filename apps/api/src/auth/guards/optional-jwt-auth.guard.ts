import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { AuthenticatedUser } from '../types.js';

/**
 * Same `'jwt'` passport strategy as `JwtAuthGuard` (see `jwt.strategy.ts`) — no cookie,
 * an expired token, or a malformed one all just mean "anonymous", never a rejected
 * request. Pairs with `@Public()` (the only opt-out from the global `JwtAuthGuard` — see
 * its own doc comment) on the specific routes that support an anonymous caller resolving
 * access through a public-link `Share` (ARCHITECTURE.md §4): `data-rooms.get`,
 * `folders.get`/`children`/`stats`, `files.get`/`downloadUrl`. Every other route on those
 * controllers stays behind the strict global guard, unchanged.
 *
 * `request.user` ends up either the authenticated user or `undefined` — read it with
 * `@OptionalCurrentUser()`, never `@CurrentUser()`, on a route guarded by this.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthenticatedUser>(
    _err: unknown,
    user: TUser | false,
  ): TUser {
    // Passport calls back with `user: false` (never a thrown `err`) when no credentials,
    // or invalid ones, are present — that's "anonymous", not a rejected request. A
    // thrown `err` (e.g. JwtStrategy.validate() finding no matching user for the token's
    // subject) is deliberately ignored for the same reason. `request.user` ends up
    // `undefined` for an anonymous caller — read it with `@OptionalCurrentUser()`.
    return (user === false ? undefined : user) as TUser;
  }
}
