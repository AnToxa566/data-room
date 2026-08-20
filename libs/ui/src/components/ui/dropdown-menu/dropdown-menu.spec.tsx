import { fireEvent, render, screen } from '@testing-library/react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  it('reveals its items when the trigger is activated', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.queryByText('Sign out')).toBeNull();

    // Radix opens the menu on pointerdown (not click) so keyboard/mouse behave
    // consistently — see @radix-ui/react-dropdown-menu's DropdownMenuTrigger.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
    });

    expect(await screen.findByText('Sign out')).toBeTruthy();
  });
});
