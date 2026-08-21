import { render, screen } from '@testing-library/react';

import { Input } from './input';

describe('Input', () => {
  it('renders as a text input and accepts a value', () => {
    render(<Input aria-label="Data Room name" defaultValue="Project Halyard" />);

    const input = screen.getByLabelText('Data Room name') as HTMLInputElement;
    expect(input.value).toBe('Project Halyard');
  });
});
