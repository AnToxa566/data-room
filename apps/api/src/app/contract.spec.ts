import { contract } from '@dataroom/contracts';

// Proves @dataroom/contracts imports and type-checks from apps/api. Once feature
// modules exist, each controller implements a slice of this contract via @ts-rest/nest
// — see ARCHITECTURE.md §6.
describe('@dataroom/contracts', () => {
  it('is importable and exposes every domain sub-router', () => {
    expect(Object.keys(contract)).toEqual([
      'auth',
      'dataRooms',
      'folders',
      'files',
      'shares',
    ]);
  });
});
