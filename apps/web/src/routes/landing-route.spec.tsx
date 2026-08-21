import { screen, waitFor, within } from '@testing-library/react';

import { renderRouterAt } from '../test/render-app';

describe('LandingPage', () => {
  it('renders the sign-in action when unauthenticated', async () => {
    renderRouterAt('/', { status: 'unauthenticated' });

    // Scoped to the page content, not the header — both show a "Sign in" button (the
    // same action) when logged out, per spec.
    const page = await screen.findByTestId('landing-page');
    expect(
      await within(page).findByRole('button', { name: 'Sign in' }),
    ).toBeTruthy();
  });

  it('shows a message for an OAuth error and strips it from the URL', async () => {
    const { router } = renderRouterAt('/?error=oauth_failed', {
      status: 'unauthenticated',
    });

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      await screen.findByText("Sign-in didn't complete. Please try again."),
    ).toBeTruthy();

    await waitFor(() => expect(router.state.location.searchStr).toBe(''));
  });

  it('sets the document title', async () => {
    renderRouterAt('/', { status: 'unauthenticated' });

    await screen.findByTestId('landing-page');
    expect(document.title).toBe('Data Red Rooms');
  });
});
