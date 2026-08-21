import { fireEvent, render, screen } from '@testing-library/react';

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog';

describe('Dialog', () => {
  it('reveals its content when the trigger is activated', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>New Data Room</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText('New Data Room')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(await screen.findByText('New Data Room')).toBeTruthy();
  });

  it('supports being controlled via open/onOpenChange', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>New Data Room</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByText('New Data Room')).toBeTruthy();
  });
});
