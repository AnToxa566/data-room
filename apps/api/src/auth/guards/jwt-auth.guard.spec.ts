import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard.js';

function buildContext(): ExecutionContext {
  // Opaque tokens — `reflector.getAllAndOverride` is mocked below, so only identity
  // (not behavior) matters.
  return {
    getHandler: () => buildContext,
    getClass: () => JwtAuthGuard,
    switchToHttp: () => ({
      getRequest: () => ({}),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

// The one thing that must never regress: a route with no `@Public()` metadata is
// guarded by default. Default-deny is the point of the global guard — see
// AGENTS.md and JwtAuthGuard's own doc comment.
describe('JwtAuthGuard', () => {
  // `AuthGuard('jwt')` — the passport-backed base class `JwtAuthGuard` extends. Real
  // passport-jwt verification, exercised through this exact code path, is covered by
  // apps/api-e2e's auth suite. This test only asserts JwtAuthGuard's own branching:
  // does it defer to authentication, or does it skip it?
  const passportAuthGuard = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (context: ExecutionContext) => unknown;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defers to real JWT authentication when no @Public() metadata is present', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const superCanActivate = jest
      .spyOn(passportAuthGuard, 'canActivate')
      .mockReturnValue(true);

    const guard = new JwtAuthGuard(reflector as unknown as Reflector);
    const result = guard.canActivate(buildContext());

    expect(reflector.getAllAndOverride).toHaveBeenCalled();
    expect(superCanActivate).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('skips authentication only when @Public() metadata is present', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const superCanActivate = jest.spyOn(passportAuthGuard, 'canActivate');

    const guard = new JwtAuthGuard(reflector as unknown as Reflector);
    const result = guard.canActivate(buildContext());

    expect(result).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });
});
