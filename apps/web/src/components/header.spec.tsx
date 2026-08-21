import { screen, within } from '@testing-library/react';

import { renderRouterAt } from '../test/render-app';

describe('Header', () => {
  it('shows the sign-in button on the landing page', async () => {
    renderRouterAt('/', { status: 'unauthenticated' });

    // Scoped to the <header> (implicit "banner" role) — the landing page below it also
    // renders its own "Sign in" button, the same action, per spec.
    const header = await screen.findByRole('banner');
    expect(
      await within(header).findByRole('button', { name: 'Sign in' }),
    ).toBeTruthy();
  });
});
