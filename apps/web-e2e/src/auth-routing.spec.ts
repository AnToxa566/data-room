import { expect, test } from '@playwright/test';

import { mockAuthToggle, mockAuthenticated, mockUnauthenticated, mockUser } from './mocks/auth';

test.describe('auth routing', () => {
  test('unauthenticated visit to /home redirects to / without flashing /home', async ({
    page,
  }) => {
    await mockUnauthenticated(page);
    await page.goto('/home');

    // /auth/me is still resolving (mocked with an artificial delay) — /home's own
    // content must not have rendered yet.
    await expect(page.getByTestId('home-page')).toHaveCount(0);

    await page.waitForURL('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();
  });

  test('authenticated visit to / redirects to /home without flashing /', async ({ page }) => {
    await mockAuthenticated(page);
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
  }) => {
    await mockAuthToggle(page, true);

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
