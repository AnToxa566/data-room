import { describe, expect, it } from 'vitest';

import {
  CreateShareBodySchema,
  ErrorSchema,
  FileSchema,
  FolderChildItemSchema,
  contract,
  paginated,
} from './index.js';

describe('contract', () => {
  it('combines every domain sub-router', () => {
    expect(Object.keys(contract)).toEqual([
      'auth',
      'dataRooms',
      'folders',
      'files',
      'shares',
      'health',
    ]);
  });
});

describe('common schemas', () => {
  it('rejects a File.size that is a number, not a string', () => {
    const result = FileSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'contract.pdf',
      dataRoomId: '11111111-1111-4111-8111-111111111111',
      folderId: '11111111-1111-4111-8111-111111111111',
      size: 12345, // BigInt must cross the wire as a string — this must fail
      mimeType: 'application/pdf',
      status: 'READY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown ErrorSchema shape', () => {
    expect(ErrorSchema.safeParse({ message: 'oops' }).success).toBe(false);
    expect(
      ErrorSchema.safeParse({ statusCode: 404, message: 'not found' }).success,
    ).toBe(true);
  });

  it('paginated() wraps an item schema with a nullable cursor', () => {
    const schema = paginated(FileSchema);
    expect(schema.safeParse({ items: [], nextCursor: null }).success).toBe(
      true,
    );
    expect(schema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('folders.children discriminated union', () => {
  it('accepts a folder item and a file item, distinguished by "kind"', () => {
    const folderItem = {
      kind: 'folder' as const,
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Diligence',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const fileItem = {
      kind: 'file' as const,
      id: '22222222-2222-4222-8222-222222222222',
      name: 'contract.pdf',
      size: '12345',
      mimeType: 'application/pdf',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(FolderChildItemSchema.safeParse(folderItem).success).toBe(true);
    expect(FolderChildItemSchema.safeParse(fileItem).success).toBe(true);
    expect(
      FolderChildItemSchema.safeParse({ ...folderItem, kind: 'nope' }).success,
    ).toBe(false);
  });
});

describe('shares.create discriminated union', () => {
  const base = {
    resourceType: 'FOLDER' as const,
    resourceId: '11111111-1111-4111-8111-111111111111',
    role: 'VIEWER' as const,
  };

  it('accepts a public-link share with no grantee', () => {
    expect(
      CreateShareBodySchema.safeParse({ ...base, mode: 'public' }).success,
    ).toBe(true);
  });

  it('accepts an email grant with a granteeEmail', () => {
    expect(
      CreateShareBodySchema.safeParse({
        ...base,
        mode: 'email',
        granteeEmail: 'a@b.com',
      }).success,
    ).toBe(true);
  });

  it('rejects an email grant missing granteeEmail — the invalid combination is unrepresentable', () => {
    expect(
      CreateShareBodySchema.safeParse({ ...base, mode: 'email' }).success,
    ).toBe(false);
  });

  it('rejects a public share that carries a granteeEmail anyway', () => {
    // Extra keys are stripped by the matching discriminated-union member, not merged in,
    // so this still validates as 'public' and the stray granteeEmail is simply dropped.
    const result = CreateShareBodySchema.safeParse({
      ...base,
      mode: 'public',
      granteeEmail: 'a@b.com',
    });
    expect(result.success).toBe(true);
    expect(result.success && 'granteeEmail' in result.data).toBe(false);
  });
});
