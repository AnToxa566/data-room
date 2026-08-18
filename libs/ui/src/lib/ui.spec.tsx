import { render } from '@testing-library/react';

import DataroomUi from './ui';

describe('DataroomUi', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<DataroomUi />);
    expect(baseElement).toBeTruthy();
  });
});
