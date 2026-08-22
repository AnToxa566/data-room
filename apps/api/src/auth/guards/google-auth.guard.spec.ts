import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema.js';
import { OAUTH_RETURN_TO_COOKIE_NAME, OAUTH_STATE_COOKIE_NAME } from '../constants.js';

import { GoogleAuthGuard } from './google-auth.guard.js';

function buildConfigService(): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    COOKIE_DOMAIN: undefined,
    COOKIE_SECURE: true,
    COOKIE_SAME_SITE: 'lax',
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function buildContext(query: Record<string, unknown>, cookies: Record<string, string> = {}) {
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  const request = { query, cookies };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

/**
 * Tests `getAuthenticateOptions` directly, the same shape `jwt-auth.guard.spec.ts` uses
 * for `JwtAuthGuard` — this is the guard's own branching logic, not passport's OAuth
 * exchange (untouched here, exercised for real by apps/api-e2e's auth suite, which
 * overrides this guard entirely — see `apps/api-e2e/src/support/test-app.ts` — and so
 * never exercises this method's `returnTo`/state-cookie behavior at all; this file is
 * the only coverage for it).
 */
describe('GoogleAuthGuard', () => {
  describe('initiating request (no code param)', () => {
    it('sets a state nonce cookie and returns it as the authenticate `state` option', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context, response } = buildContext({});

      const options = guard.getAuthenticateOptions(context);

      expect(response.cookie).toHaveBeenCalledWith(
        OAUTH_STATE_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ httpOnly: true, path: '/api/auth/google' }),
      );
      expect(options).toEqual({ state: expect.any(String) });
    });

    it('sets a returnTo cookie when a valid in-app path is given', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context, response } = buildContext({ returnTo: '/folders/abc-123' });

      guard.getAuthenticateOptions(context);

      expect(response.cookie).toHaveBeenCalledWith(
        OAUTH_RETURN_TO_COOKIE_NAME,
        '/folders/abc-123',
        expect.objectContaining({ httpOnly: true, path: '/api/auth/google' }),
      );
    });

    it('does not set a returnTo cookie when the param is absent', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context, response } = buildContext({});

      guard.getAuthenticateOptions(context);

      expect(response.cookie).not.toHaveBeenCalledWith(
        OAUTH_RETURN_TO_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not set a returnTo cookie for an invalid (open-redirect-shaped) value', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context, response } = buildContext({ returnTo: '//evil.example' });

      guard.getAuthenticateOptions(context);

      expect(response.cookie).not.toHaveBeenCalledWith(
        OAUTH_RETURN_TO_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('callback request (code param present)', () => {
    it('clears the state cookie and succeeds when the state matches', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context, response } = buildContext(
        { code: 'fake-code', state: 'matching-nonce' },
        { [OAUTH_STATE_COOKIE_NAME]: 'matching-nonce' },
      );

      const options = guard.getAuthenticateOptions(context);

      expect(response.clearCookie).toHaveBeenCalledWith(
        OAUTH_STATE_COOKIE_NAME,
        expect.objectContaining({ path: '/api/auth/google' }),
      );
      expect(options).toEqual({});
    });

    it('throws UnauthorizedException when the state cookie is missing', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context } = buildContext({ code: 'fake-code', state: 'anything' }, {});

      expect(() => guard.getAuthenticateOptions(context)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the state does not match the cookie', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context } = buildContext(
        { code: 'fake-code', state: 'forged' },
        { [OAUTH_STATE_COOKIE_NAME]: 'real-nonce' },
      );

      expect(() => guard.getAuthenticateOptions(context)).toThrow(UnauthorizedException);
    });

    // The callback branch never touches the returnTo cookie itself — reading and
    // clearing it is `auth.controller.ts#googleCallback`'s job, once login actually
    // succeeds, not this guard's.
    it('does not read or clear the returnTo cookie', () => {
      const guard = new GoogleAuthGuard(buildConfigService());
      const { context, response } = buildContext(
        { code: 'fake-code', state: 'matching-nonce' },
        { [OAUTH_STATE_COOKIE_NAME]: 'matching-nonce', [OAUTH_RETURN_TO_COOKIE_NAME]: '/folders/x' },
      );

      guard.getAuthenticateOptions(context);

      expect(response.clearCookie).not.toHaveBeenCalledWith(
        OAUTH_RETURN_TO_COOKIE_NAME,
        expect.anything(),
      );
    });
  });
});
