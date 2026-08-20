import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Storage } from '@google-cloud/storage';

import type { Env } from '../config/env.schema.js';

import { normalizePrivateKey } from './private-key.util.js';

export interface ObjectMetadata {
  size: number;
  contentType: string;
}

export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}

/**
 * RFC 6266 `Content-Disposition` value for an inline (browser-rendered) response,
 * carrying the file's real name. `filename` is arbitrary user input (a File.name up to
 * 255 chars) — CR/LF is stripped so it can't inject extra headers, and both the ASCII
 * `filename` fallback and the UTF-8 `filename*` form are set so non-ASCII names (a due
 * diligence document store can't assume English) still round-trip in browsers that
 * honor `filename*`.
 */
export function buildInlineDisposition(filename: string): string {
  const singleLine = filename.replace(/[\r\n]/g, ' ');
  const asciiFallback = singleLine.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(singleLine)}`;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 404
  );
}

/**
 * Thin wrapper around `@google-cloud/storage`. No other part of the codebase imports
 * `@google-cloud/storage` directly — see AGENTS.md's iteration 4 instructions and
 * ARCHITECTURE.md §2. Deliberately knows nothing about Data Rooms, folders, or files: it
 * takes and returns opaque object keys. Key construction
 * (`datarooms/{dataRoomId}/{fileId}`) lives one layer up, in
 * apps/api/src/files/storage-key.util.ts.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(configService: ConfigService<Env, true>) {
    this.bucketName = configService.get('GCS_BUCKET_NAME', { infer: true });
    const projectId = configService.get('GCS_PROJECT_ID', { infer: true });
    const clientEmail = configService.get('GCS_CLIENT_EMAIL', { infer: true });
    const privateKey = configService.get('GCS_PRIVATE_KEY', { infer: true });

    // env.schema.ts's superRefine already guarantees these are set together or both
    // unset, and runs before any provider (including this one) is constructed — this is
    // a real two-way branch, not a defensive third case.
    if (clientEmail && privateKey) {
      this.storage = new Storage({
        projectId,
        credentials: {
          client_email: clientEmail,
          // Escaped `\n`s converted here, not in env.schema.ts — keeps the conversion a
          // plain, independently unit-testable function. See private-key.util.ts.
          private_key: normalizePrivateKey(privateKey),
        },
      });
      this.logger.log(
        'GCS signing mode: explicit service-account credentials (GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY).',
      );
    } else {
      // No explicit credentials: @google-cloud/storage falls back to Application
      // Default Credentials and signs URLs via the IAM Credentials API's signBlob,
      // using the runtime service account's own identity — no private key ever leaves
      // GCP. Requires that service account to hold `roles/iam.serviceAccountTokenCreator`
      // on itself. See ARCHITECTURE.md's decision log.
      this.storage = new Storage({ projectId });
      this.logger.log(
        'GCS signing mode: Application Default Credentials via IAM Credentials signBlob (GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY not set).',
      );
    }
  }

  private file(key: string) {
    return this.storage.bucket(this.bucketName).file(key);
  }

  /**
   * V4 signed PUT URL. `contentType` is included in the signature — the browser must
   * send exactly that `Content-Type` on the PUT, or GCS rejects the request with `403`.
   * See ARCHITECTURE.md §5.
   */
  async getSignedUploadUrl(
    key: string,
    contentType: string,
    ttlMinutes: number,
  ): Promise<SignedUrlResult> {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const [url] = await this.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType,
    });
    return { url, expiresAt };
  }

  /**
   * V4 signed GET URL with the response disposition forced to `inline` and the response
   * `Content-Type` forced to the file's stored `mimeType` — so the browser renders a PDF
   * instead of downloading it, per the iteration 4 spec.
   */
  async getSignedDownloadUrl(
    key: string,
    filename: string,
    contentType: string,
    ttlMinutes: number,
  ): Promise<SignedUrlResult> {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const [url] = await this.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
      responseDisposition: buildInlineDisposition(filename),
      responseType: contentType,
    });
    return { url, expiresAt };
  }

  /**
   * The object's real size and content type, or `null` if it doesn't exist in GCS —
   * `FilesService.complete` turns that into a `400` rather than persisting a client's
   * claim. Never trusts anything but GCS itself. See ARCHITECTURE.md §5.
   */
  async getObjectMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const [metadata] = await this.file(key).getMetadata();
      return {
        size: Number(metadata.size ?? 0),
        contentType: metadata.contentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes one object. Swallows and logs failures rather than throwing — per
   * ARCHITECTURE.md §5, a blob left behind after its row is already gone is harmless (it
   * is swept by prefix on Data Room/folder deletion) and must never turn a successful
   * database delete into a failed request.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.file(key).delete({ ignoreNotFound: true });
    } catch (error) {
      this.logger.error(
        `Failed to delete object "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Deletes every object whose key starts with `prefix` — a Data Room delete
   * (`datarooms/{dataRoomId}/`) or a folder's subtree of file objects. Lists then deletes
   * each object individually (via the already-`ignoreNotFound`, already-logged
   * `deleteObject`) rather than the SDK's own `Bucket#deleteFiles`, whose all-or-nothing
   * failure behavior on a partial error is a worse fit than "delete what you can, log the
   * rest" — same never-throw contract as `deleteObject`.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      const [files] = await this.storage.bucket(this.bucketName).getFiles({ prefix });
      await Promise.all(files.map((file) => this.deleteObject(file.name)));
    } catch (error) {
      this.logger.error(
        `Failed to list objects with prefix "${prefix}" for deletion`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
