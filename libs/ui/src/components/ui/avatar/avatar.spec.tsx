import { render } from '@testing-library/react';

import { Avatar, AvatarFallback } from './avatar';

describe('Avatar', () => {
  it('renders its fallback content', () => {
    const { getByText } = render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>,
    );
    expect(getByText('JD')).toBeTruthy();
  });
});
