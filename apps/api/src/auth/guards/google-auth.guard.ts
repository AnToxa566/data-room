import { randomBytes, timingSafeEqual } from 'node:crypto';

import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, IAuthModuleOptions } from '@nestjs/passport';
import type { CookieOptions, Request, Response } from 'express';

import type { Env } from '../../config/env.schema.js';
import { oauthReturnToCookieOptions } from '../cookie.util.js';
import {
  OAUTH_RETURN_TO_COOKIE_NAME,
  OAUTH_RETURN_TO_TTL_MS,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_MS,
} from '../constants.js';
import { parseReturnTo } from '../return-to.util.js';

/**
 * Wraps `AuthGuard('google')` to add OAuth `state` CSRF protection without a server-side
 * session (see GoogleStrategy for why). This is the "double-submit cookie" pattern:
 *
 *  - Initiating request (`GET /auth/google`, no `code` yet): mint a random nonce, set it
 *    as a short-lived httpOnly cookie, and pass it as the `state` authenticate-time
 *    option — passport-oauth2 forwards an explicit string `state` option into the
 *    redirect URL regardless of the strategy's own (session-based) `state` setting.
 *  - Callback request (`code` present): compare the `state` query param Google echoed
 *    back against the nonce cookie the browser is still carrying. A mismatch — forged,
 *    replayed, or the cookie expired/was never set — throws before passport ever
 *    exchanges the code, so a failed check never touches Google's token endpoint.
 *
 * `getAuthenticateOptions` is called by `AuthGuard.canActivate` before it invokes
 * `passport.authenticate(...)`, so throwing here aborts the guard the same way any
 * other guard failure would — caught by `GoogleAuthExceptionFilter` on the callback
 * route.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService<Env, true>) {
    super();
  }

  override getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const isCallback = typeof request.query['code'] === 'string';

    if (!isCallback) {
      const state = randomBytes(32).toString('hex');
      response.cookie(OAUTH_STATE_COOKIE_NAME, state, this.stateCookieOptions());

      // A validated in-app path only — see parseReturnTo. Set as its own cookie, never
      // folded into `state` itself (that value is compared with `timingSafeEqual` as a
      // bare nonce below).
      const returnTo = parseReturnTo(request.query['returnTo']);
      if (returnTo) {
        response.cookie(OAUTH_RETURN_TO_COOKIE_NAME, returnTo, {
          ...oauthReturnToCookieOptions(this.configService),
          maxAge: OAUTH_RETURN_TO_TTL_MS,
        });
      }

      return { state };
    }

    const expectedState = request.cookies?.[OAUTH_STATE_COOKIE_NAME] as string | undefined;
    const returnedState = request.query['state'];
    response.clearCookie(OAUTH_STATE_COOKIE_NAME, this.stateCookieOptions());

    if (
      typeof returnedState !== 'string' ||
      !expectedState ||
      !constantTimeEquals(returnedState, expectedState)
    ) {
      throw new UnauthorizedException('Invalid or missing OAuth state parameter');
    }

    return {};
  }

  private stateCookieOptions(): CookieOptions {
    const domain = this.configService.get('COOKIE_DOMAIN', { infer: true });
    return {
      httpOnly: true,
      secure: this.configService.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.configService.get('COOKIE_SAME_SITE', { infer: true }),
      path: '/api/auth/google',
      maxAge: OAUTH_STATE_TTL_MS,
      ...(domain ? { domain } : {}),
    };
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
