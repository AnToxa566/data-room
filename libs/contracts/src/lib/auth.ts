import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorSchema, SuccessSchema, UserSchema } from './common.js';

const c = initContract();

export const authContract = c.router({
  /**
   * Full-page browser navigation to Google's consent screen — never called via the
   * ts-rest/fetch client. The 302 response is declared for documentation completeness;
   * its body is never inspected.
   */
  googleLogin: {
    method: 'GET',
    path: '/auth/google',
    responses: {
      302: z.void(),
    },
    summary: 'Redirect to Google OAuth consent screen.',
  },
  /**
   * Google redirects the browser here after consent. Exchanges the code, sets the
   * session cookie, and redirects again to the SPA. Also browser-navigated only.
   */
  googleCallback: {
    method: 'GET',
    path: '/auth/google/callback',
    responses: {
      302: z.void(),
      401: ErrorSchema,
    },
    summary:
      'OAuth callback — sets the session cookie and redirects to the SPA.',
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    body: z.void(),
    responses: {
      200: SuccessSchema,
      401: ErrorSchema,
    },
    summary: 'Clear the session cookie.',
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
