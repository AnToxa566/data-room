import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorSchema, UserSchema } from './common.js';

const c = initContract();

/**
 * `GET /auth/google` and `GET /auth/google/callback` are deliberately NOT part of this
 * contract. Both are full-page browser redirects (302), never JSON responses ts-rest's
 * fetch client would parse, and the callback's only job is to set a cookie and bounce
 * the browser to the SPA. They are implemented as plain Nest controllers instead — see
 * apps/api's AuthController. This is a narrowing of the auth surface, not an omission;
 * see ARCHITECTURE.md's decision log.
 */
export const authContract = c.router({
  logout: {
    method: 'POST',
    path: '/auth/logout',
    body: z.void(),
    responses: {
      204: z.void(),
      401: ErrorSchema,
    },
    summary: 'Clear the session cookie. Idempotent.',
  },
  me: {
    method: 'GET',
    path: '/auth/me',
    responses: {
      200: UserSchema,
      401: ErrorSchema,
    },
    summary: 'The currently authenticated user.',
  },
});
