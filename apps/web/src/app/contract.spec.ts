import { contract } from '@dataroom/contracts';

// Proves @dataroom/contracts imports and type-checks from apps/web. Once routing exists,
// pages consume this contract via @ts-rest/react-query — see ARCHITECTURE.md §3, §6.
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
