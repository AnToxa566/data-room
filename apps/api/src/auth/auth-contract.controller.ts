import { Controller, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Request } from 'express';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import type { Env } from '../config/env.schema.js';

import { toUserDto } from './user.mapper.js';
import { SESSION_COOKIE_NAME } from './constants.js';
import { sessionCookieOptions } from './cookie.util.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './types.js';

/**
 * The JSON half of auth — `me` and `logout` — implemented against the ts-rest contract.
 * Both routes require a session (no `@Public()`): the global `JwtAuthGuard` covers them,
 * so a missing/tampered/expired cookie 401s before this handler runs.
 *
 * Reads the response object off `req.res` rather than injecting `@Res()` — combining
 * `@Res()` (even with `{ passthrough: true }`) with `@TsRestHandler` is a known
 * incompatibility in @ts-rest/nest: Nest switches the route to library-managed response
 * mode, ts-rest's own response writer never runs, and the request hangs until timeout
 * (ts-rest/ts-rest#417, closed as not planned). `req.res` is the same Express `Response`
 * Nest would have injected, obtained without tripping that mode switch.
 */
@Controller()
export class AuthContractController {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  @TsRestHandler(contract.auth)
  handler(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return tsRestHandler(contract.auth, {
      me: async () => ({ status: 200, body: toUserDto(user) }),
      logout: async () => {
        // Identical attributes to the ones the cookie was set with — see cookie.util.ts.
        // No token denylist exists (documented simplification), so this is idempotent
        // with respect to the token that authenticated the call: as long as it's still
        // valid, repeating this request always clears the cookie and returns 204.
        req.res?.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(this.configService));
        return { status: 204, body: undefined };
      },
    });
  }
}
