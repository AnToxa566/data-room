import { expect, test } from '@playwright/test';

import {
  mockAuthToggle,
  mockAuthenticated,
  mockUnauthenticated,
  mockUser,
  trackMeRequests,
} from './mocks/auth';

test.describe('auth routing', () => {
  test('unauthenticated visit to /home redirects to / without flashing /home', async ({
    page,
    baseURL,
  }) => {
    // An expired/invalid session cookie, not "never logged in" — see this test's
    // sibling below for the no-cookie-at-all case. /auth/me is expected to fire here.
    await mockUnauthenticated(page, baseURL as string);
    await page.goto('/home');

    // /auth/me is still resolving (mocked with an artificial delay) — /home's own
    // content must not have rendered yet.
    await expect(page.getByTestId('home-page')).toHaveCount(0);

    await page.waitForURL('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();
  });

  test('fresh visitor with no session cookie never calls /auth/me', async ({ page }) => {
    // No has_session cookie is set anywhere here — a brand-new browser context starts
    // with none — so useCurrentUser() should skip the network call entirely rather than
    // firing it just to get a 401 back.
    const meRequests = trackMeRequests(page);

    await page.goto('/home');

    await page.waitForURL('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();
    expect(meRequests).toHaveLength(0);
  });

  test('authenticated visit to / redirects to /home without flashing /', async ({
    page,
    baseURL,
  }) => {
    await mockAuthenticated(page, baseURL as string);
    await page.goto('/');

    // /auth/me is still resolving — landing's own content must not have rendered yet.
    await expect(page.getByTestId('landing-page')).toHaveCount(0);

    await page.waitForURL('/home');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /welcome back/i }),
    ).toBeVisible();
  });

  test('sign out returns to / and a subsequent /home visit redirects back', async ({
    page,
    baseURL,
  }) => {
    await mockAuthToggle(page, baseURL as string, true);

    await page.goto('/');
    await page.waitForURL('/home');

    // Scoped to the header — the home page below it also shows the user's name, in its
    // greeting.
    await page
      .getByRole('banner')
      .getByRole('button', { name: new RegExp(mockUser.name as string) })
      .click();
    await page.getByText('Sign out').click();

    await page.waitForURL('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();

    await page.goto('/home');
    await page.waitForURL('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();
  });
});
