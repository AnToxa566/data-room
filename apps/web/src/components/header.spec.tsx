import { fireEvent, screen, within } from '@testing-library/react';

import type { User } from '@dataroom/contracts';

import { renderRouterAt } from '../test/render-app';

const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Header', () => {
  it('shows the sign-in button when unauthenticated', async () => {
    renderRouterAt('/', { status: 'unauthenticated' });

    // Scoped to the <header> (implicit "banner" role) — the landing page below it also
    // renders its own "Sign in" button, the same action, per spec.
    const header = await screen.findByRole('banner');
    expect(
      await within(header).findByRole('button', { name: 'Sign in' }),
    ).toBeTruthy();
  });

  it('shows the user menu when authenticated', async () => {
    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    // The trigger's accessible name combines the avatar fallback and the name span
    // (e.g. "AL Ada Lovelace") — match loosely rather than assume the exact concatenation.
    const trigger = await screen.findByRole('button', { name: /Ada Lovelace/ });

    fireEvent.pointerDown(trigger, { button: 0 });

    expect(await screen.findByText('Sign out')).toBeTruthy();
  });
});
