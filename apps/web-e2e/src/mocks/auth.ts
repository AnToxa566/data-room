import type { Page } from '@playwright/test';

/**
 * Mirrors the API's `HAS_SESSION_COOKIE_NAME` (apps/api/src/auth/constants.ts) and the
 * frontend's own copy of it (apps/web/src/lib/auth.ts) — a separate literal rather than
 * an import for the same reason those two don't import it from each other either.
 *
 * `useCurrentUser()` now skips `/auth/me` entirely when this cookie is absent from the
 * real browser context — these mocks only intercept the network call, so any scenario
 * below that isn't "never logged in" has to also set this cookie for real, or the app
 * never even attempts the request the mock is waiting to answer.
 */
const HAS_SESSION_COOKIE_NAME = 'has_session';

async function setHasSessionCookie(page: Page, baseURL: string): Promise<void> {
  await page.context().addCookies([{ name: HAS_SESSION_COOKIE_NAME, value: '1', url: baseURL }]);
}

async function clearHasSessionCookie(page: Page): Promise<void> {
  await page.context().clearCookies({ name: HAS_SESSION_COOKIE_NAME });
}

export interface MockUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const mockUser: MockUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// A small artificial delay on /auth/me so the "no flash" assertions in
// auth-routing.spec.ts have a real window to check against — a same-tick mocked response
// wouldn't exercise the loading state at all.
const RESPONSE_DELAY_MS = 250;

async function delay() {
  await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
}

/**
 * Represents a session cookie that exists but no longer authenticates (expired/revoked)
 * — not "never logged in" — so the `has_session` marker is set for real and `/auth/me`
 * is still expected to fire. See `mockNeverAuthenticated` for the no-cookie-at-all case
 * this mock deliberately isn't testing.
 */
export async function mockUnauthenticated(page: Page, baseURL: string): Promise<void> {
  await setHasSessionCookie(page, baseURL);
  await page.route('**/api/auth/me', async (route) => {
    await delay();
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
    });
  });
}

export async function mockAuthenticated(
  page: Page,
  baseURL: string,
  user: MockUser = mockUser,
): Promise<void> {
  await setHasSessionCookie(page, baseURL);
  await page.route('**/api/auth/me', async (route) => {
    await delay();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

/**
 * A single persistent /auth/me handler backed by a mutable flag, plus a mocked
 * /auth/logout that flips it — used for the sign-out scenario, where the same page needs
 * to move between authenticated and unauthenticated across the test.
 */
/**
 * Records every `/auth/me` request `page` makes from here on, without answering any of
 * them — the fresh-visitor, never-logged-in case (no `has_session` cookie set) is
 * expected to make none at all, so there's nothing to mock a response for. A test asserts
 * the returned array stays empty.
 */
export function trackMeRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/me')) {
      requests.push(request.url());
    }
  });
  return requests;
}

export async function mockAuthToggle(
  page: Page,
  baseURL: string,
  initialAuthenticated: boolean,
): Promise<void> {
  let authenticated = initialAuthenticated;
  if (initialAuthenticated) {
    await setHasSessionCookie(page, baseURL);
  }

  await page.route('**/api/auth/me', async (route) => {
    await delay();
    if (authenticated) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
      });
    }
  });

  await page.route('**/api/auth/logout', async (route) => {
    authenticated = false;
    // The real logout handler clears the marker cookie alongside the httpOnly session
    // cookie (see apps/api's AuthContractController) — mirrored here so a subsequent
    // fresh navigation sees no session cookie and doesn't even attempt /auth/me.
    await clearHasSessionCookie(page);
    await route.fulfill({ status: 204 });
  });
}
