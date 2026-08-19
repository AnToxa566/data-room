import { render } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should have a greeting as the title', () => {
    const { getAllByText } = render(<App />);
    expect(
      getAllByText(new RegExp('Welcome @dataroom/web', 'gi')).length > 0,
    ).toBeTruthy();
  });

  it('renders the shadcn Button from @dataroom/ui', () => {
    const { getByRole } = render(<App />);
    expect(getByRole('button', { name: /hello data room/i })).toBeTruthy();
  });
});
