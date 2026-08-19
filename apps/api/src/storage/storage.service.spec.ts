import type { ConfigService } from '@nestjs/config';

import { Storage } from '@google-cloud/storage';

import type { Env } from '../config/env.schema.js';

import { buildInlineDisposition, StorageService } from './storage.service.js';

// Automock — no factory, so none of the "out-of-scope variable" hoisting rules apply.
// Full control over the constructed instance comes from `MockedStorage.mockImplementation`
// in `beforeEach` below. See ARCHITECTURE.md §5 / AGENTS.md's iteration 4 instructions:
// signed-URL *generation* is unit-tested here (no network call — V4 signing is a local
// RSA operation over the service account key); e2e specs mock `StorageService` wholesale.
jest.mock('@google-cloud/storage');

const MockedStorage = Storage as jest.MockedClass<typeof Storage>;

function buildConfigService(
  overrides: Partial<Record<string, string>> = {},
): ConfigService<Env, true> {
  const values: Record<string, string> = {
    GCS_PROJECT_ID: 'test-project',
    GCS_CLIENT_EMAIL: 'sa@test-project.iam.gserviceaccount.com',
    GCS_PRIVATE_KEY:
      '-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n',
    GCS_BUCKET_NAME: 'test-bucket',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

describe('StorageService', () => {
  let mockFile: { getSignedUrl: jest.Mock; getMetadata: jest.Mock; delete: jest.Mock };
  let mockBucket: { file: jest.Mock; getFiles: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFile = {
      getSignedUrl: jest.fn(),
      getMetadata: jest.fn(),
      delete: jest.fn(),
    };
    mockBucket = {
      file: jest.fn().mockReturnValue(mockFile),
      getFiles: jest.fn(),
    };
    MockedStorage.mockImplementation(
      () => ({ bucket: jest.fn().mockReturnValue(mockBucket) }) as unknown as Storage,
    );
  });

  describe('construction', () => {
    it('builds the Storage client from GCS_* config, converting the private key\'s escaped newlines', () => {
      new StorageService(buildConfigService());

      expect(MockedStorage).toHaveBeenCalledWith({
        projectId: 'test-project',
        credentials: {
          client_email: 'sa@test-project.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n',
        },
      });
    });
  });

  describe('getSignedUploadUrl', () => {
    it('signs a v4 write URL for the given key, with contentType included', async () => {
      mockFile.getSignedUrl.mockResolvedValue(['https://signed.example/upload']);
      const service = new StorageService(buildConfigService());

      const result = await service.getSignedUploadUrl(
        'datarooms/room-1/file-1',
        'application/pdf',
        15,
      );

      expect(mockBucket.file).toHaveBeenCalledWith('datarooms/room-1/file-1');
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'write',
          contentType: 'application/pdf',
        }),
      );
      expect(result.url).toBe('https://signed.example/upload');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getSignedDownloadUrl', () => {
    it('signs a v4 read URL with an inline disposition and the stored content type', async () => {
      mockFile.getSignedUrl.mockResolvedValue(['https://signed.example/download']);
      const service = new StorageService(buildConfigService());

      await service.getSignedDownloadUrl(
        'datarooms/room-1/file-1',
        'Q3 Report.pdf',
        'application/pdf',
        15,
      );

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'read',
          responseType: 'application/pdf',
          responseDisposition: expect.stringMatching(/^inline;/),
        }),
      );
    });
  });

  describe('getObjectMetadata', () => {
    it('returns the size and content type GCS reports', async () => {
      mockFile.getMetadata.mockResolvedValue([
        { size: '12345', contentType: 'application/pdf' },
      ]);
      const service = new StorageService(buildConfigService());

      await expect(service.getObjectMetadata('datarooms/room-1/file-1')).resolves.toEqual(
        { size: 12345, contentType: 'application/pdf' },
      );
    });

    it('returns null when the object does not exist, instead of throwing', async () => {
      mockFile.getMetadata.mockRejectedValue({ code: 404 });
      const service = new StorageService(buildConfigService());

      await expect(
        service.getObjectMetadata('datarooms/room-1/missing'),
      ).resolves.toBeNull();
    });

    it('rethrows a non-404 error', async () => {
      mockFile.getMetadata.mockRejectedValue({ code: 500, message: 'boom' });
      const service = new StorageService(buildConfigService());

      await expect(
        service.getObjectMetadata('datarooms/room-1/file-1'),
      ).rejects.toMatchObject({ code: 500 });
    });
  });

  describe('deleteObject', () => {
    it('deletes with ignoreNotFound, and never throws', async () => {
      mockFile.delete.mockRejectedValue(new Error('network blip'));
      const service = new StorageService(buildConfigService());

      await expect(service.deleteObject('datarooms/room-1/file-1')).resolves.toBeUndefined();
      expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });
  });

  describe('deleteByPrefix', () => {
    it('lists objects under the prefix and deletes each one', async () => {
      const fileA = { name: 'datarooms/room-1/a', delete: jest.fn().mockResolvedValue(undefined) };
      const fileB = { name: 'datarooms/room-1/b', delete: jest.fn().mockResolvedValue(undefined) };
      mockBucket.getFiles.mockResolvedValue([[fileA, fileB]]);
      mockBucket.file.mockImplementation((key: string) =>
        [fileA, fileB].find((f) => f.name === key),
      );
      const service = new StorageService(buildConfigService());

      await service.deleteByPrefix('datarooms/room-1/');

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'datarooms/room-1/' });
      expect(fileA.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
      expect(fileB.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });

    it('never throws, even if listing itself fails', async () => {
      mockBucket.getFiles.mockRejectedValue(new Error('network blip'));
      const service = new StorageService(buildConfigService());

      await expect(service.deleteByPrefix('datarooms/room-1/')).resolves.toBeUndefined();
    });
  });
});

describe('buildInlineDisposition', () => {
  it('always leads with "inline" and carries both filename forms', () => {
    const disposition = buildInlineDisposition('Q3 Report.pdf');

    expect(disposition.startsWith('inline;')).toBe(true);
    expect(disposition).toContain('filename="Q3 Report.pdf"');
    expect(disposition).toContain("filename*=UTF-8''Q3%20Report.pdf");
  });

  it('strips CR/LF so a crafted filename cannot inject extra headers', () => {
    const disposition = buildInlineDisposition('evil\r\nX-Injected: true');

    expect(disposition).not.toMatch(/[\r\n]/);
  });
});
