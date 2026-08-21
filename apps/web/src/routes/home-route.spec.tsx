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

describe('HomePage — empty state', () => {
  it('shows the empty-state copy and the room list nav', async () => {
    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    const page = await screen.findByTestId('home-page');
    expect(within(page).getByText('Data Rooms')).toBeTruthy();
    expect(
      within(page).getByText('You have no Data Rooms yet'),
    ).toBeTruthy();
    // The nav lives in the sidebar, outside the "home-page" content area.
    expect(await screen.findByText('None yet')).toBeTruthy();
    expect(await screen.findByText('Nothing shared with you')).toBeTruthy();
  });

  it('renders both "New Data Room" actions without wiring them up', async () => {
    const { router } = renderRouterAt('/home', {
      status: 'authenticated',
      user: mockUser,
    });

    const [newRoomButton, ...rest] = await screen.findAllByRole('button', {
      name: 'New Data Room',
    });
    expect(rest).toHaveLength(0);

    const cta = await screen.findByRole('button', {
      name: 'Create your first Data Room',
    });

    // Creating a Data Room isn't implemented yet — clicking either action does
    // nothing observable (no navigation, no thrown error).
    fireEvent.click(newRoomButton);
    fireEvent.click(cta);
    expect(router.state.location.pathname).toBe('/home');
  });

  it('shows the signed-in user in the sidebar', async () => {
    renderRouterAt('/home', { status: 'authenticated', user: mockUser });

    expect(await screen.findByText('ada@example.com')).toBeTruthy();
    expect(await screen.findByText('Sign out')).toBeTruthy();
  });
});
