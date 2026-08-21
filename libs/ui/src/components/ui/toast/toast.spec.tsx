import { act, render, screen } from '@testing-library/react';

import { ToastProvider, useToast } from './toast';

function ToastTrigger({ message, tone }: { message: string; tone?: 'default' | 'danger' }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(message, tone)}>
      Fire toast
    </button>
  );
}

describe('ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast when triggered, then auto-dismisses it', async () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Renamed to &quot;Project Halyard&quot;" />
      </ToastProvider>,
    );

    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      screen.getByRole('button', { name: 'Fire toast' }).click();
    });

    expect(screen.getByRole('status').textContent).toBe('Renamed to "Project Halyard"');

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stacks more than one toast at a time', async () => {
    render(
      <ToastProvider>
        <ToastTrigger message="First" />
        <ToastTrigger message="Second" tone="danger" />
      </ToastProvider>,
    );

    const [firstButton, secondButton] = screen.getAllByRole('button', { name: 'Fire toast' });
    await act(async () => {
      firstButton.click();
      secondButton.click();
    });

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('throws when used outside a ToastProvider', () => {
    // Swallow the error React logs to the console for this expected-to-throw render.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ToastTrigger message="unused" />)).toThrow(
      'useToast must be used within a ToastProvider',
    );
    consoleError.mockRestore();
  });
});
