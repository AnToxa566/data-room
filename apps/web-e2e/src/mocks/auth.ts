import type { Page } from '@playwright/test';

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

export async function mockUnauthenticated(page: Page): Promise<void> {
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
  user: MockUser = mockUser,
): Promise<void> {
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
export async function mockAuthToggle(
  page: Page,
  initialAuthenticated: boolean,
): Promise<void> {
  let authenticated = initialAuthenticated;

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
    await route.fulfill({ status: 204 });
  });
}
