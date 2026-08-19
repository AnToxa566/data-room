import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import ms from 'ms';

import type { Env } from '../config/env.schema.js';

/**
 * Cookie attributes shared by every place that sets or clears the session cookie.
 * Building them from one function (rather than repeating the literal object at each
 * call site) is what guarantees `res.clearCookie` is called with attributes identical
 * to the ones `res.cookie` used — a mismatch on any one of httpOnly/secure/sameSite/
 * path/domain makes the browser silently keep the original cookie instead of clearing
 * it. `maxAge`/`expires` are deliberately excluded here: `clearCookie` sets its own
 * (expired) value for those, and set-cookie call sites append `maxAge` themselves.
 */
export function sessionCookieOptions(
  configService: ConfigService<Env, true>,
): CookieOptions {
  const domain = configService.get('COOKIE_DOMAIN', { infer: true });
  return {
    httpOnly: true,
    secure: configService.get('COOKIE_SECURE', { infer: true }),
    sameSite: configService.get('COOKIE_SAME_SITE', { infer: true }),
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

/** `JWT_EXPIRES_IN` ("7d", "24h", ...) converted to milliseconds for the cookie's
 * `maxAge`, so the cookie's browser-side lifetime matches the token's server-side one. */
export function sessionCookieMaxAgeMs(configService: ConfigService<Env, true>): number {
  const expiresIn = configService.get('JWT_EXPIRES_IN', { infer: true });
  const parsed = ms(expiresIn as ms.StringValue);
  if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
    throw new Error(`JWT_EXPIRES_IN "${expiresIn}" is not a valid duration string`);
  }
  return parsed;
}
