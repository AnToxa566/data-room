import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FileStatus, PrismaService } from '@dataroom/database';
import type { File as PrismaFile } from '@dataroom/database';
import type { CreateUploadUrlBody, File as ContractFile, UpdateFileBody } from '@dataroom/contracts';

import { AccessControlService } from '../access-control/access-control.service.js';
import type { Env } from '../config/env.schema.js';
import { isUniqueConstraintViolation } from '../common/prisma-error.util.js';
import { StorageService } from '../storage/storage.service.js';

import { toFileDto } from './file.mapper.js';
import { buildStorageKey } from './storage-key.util.js';

export interface CreateUploadUrlResult {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface DownloadUrlResult {
  url: string;
  expiresAt: string;
}

@Injectable()
export class FilesService {
  private readonly maxFileSizeBytes: number;
  private readonly allowedMimeTypes: string[];
  private readonly uploadUrlTtlMinutes: number;
  private readonly downloadUrlTtlMinutes: number;
  private readonly pendingTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly storage: StorageService,
    configService: ConfigService<Env, true>,
  ) {
    this.maxFileSizeBytes = configService.get('MAX_FILE_SIZE_BYTES', { infer: true });
    this.allowedMimeTypes = configService.get('ALLOWED_MIME_TYPES', { infer: true });
    this.uploadUrlTtlMinutes = configService.get('UPLOAD_URL_TTL_MINUTES', { infer: true });
    this.downloadUrlTtlMinutes = configService.get('DOWNLOAD_URL_TTL_MINUTES', {
      infer: true,
    });
    this.pendingTtlMinutes = configService.get('PENDING_TTL_MINUTES', { infer: true });
  }

  /**
   * Phase 1 of the two-phase upload — see ARCHITECTURE.md §5. Validates, reserves a
   * PENDING row (which also claims the name), and returns a signed PUT URL. The file's id
   * is generated here, not by Postgres, so `storageKey` can be computed and stored in the
   * same insert — no create-then-update dance (contrast `FoldersService.create`, where
   * `path` embeds the row's own id but has no uniqueness constraint to worry about
   * colliding a placeholder value against).
   */
  async createUploadUrl(
    userId: string,
    body: CreateUploadUrlBody,
  ): Promise<CreateUploadUrlResult> {
    await this.accessControl.requireAccess(userId, 'FOLDER', body.folderId, 'OWNER');
    const folder = await this.findFolderOrThrow(body.folderId);

    if (!this.allowedMimeTypes.includes(body.mimeType)) {
      throw new BadRequestException(`mimeType "${body.mimeType}" is not allowed.`);
    }
    if (body.size > this.maxFileSizeBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${this.maxFileSizeBytes}-byte limit.`,
      );
    }

    const file = await this.createPendingFile(folder.dataRoomId, body);

    const { url: uploadUrl, expiresAt } = await this.storage.getSignedUploadUrl(
      file.storageKey,
      body.mimeType,
      this.uploadUrlTtlMinutes,
    );

    return { fileId: file.id, uploadUrl, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Phase 3 — reads the object's real metadata from GCS and flips PENDING -> READY.
   * Never trusts a client-supplied size; see ARCHITECTURE.md §5. Safe to call twice: the
   * second call finds `status !== 'PENDING'` and 400s without touching anything.
   */
  async complete(userId: string, id: string): Promise<ContractFile> {
    await this.accessControl.requireAccess(userId, 'FILE', id, 'OWNER');
    const file = await this.findFileOrThrow(id);
    if (file.status !== FileStatus.PENDING) {
      throw new BadRequestException('This upload has already been completed.');
    }

    const metadata = await this.storage.getObjectMetadata(file.storageKey);
    if (!metadata) {
      throw new BadRequestException(
        'The upload has not landed in storage yet — retry the PUT and call complete again.',
      );
    }

    const updated = await this.prisma.file.update({
      where: { id },
      data: {
        size: metadata.size,
        mimeType: metadata.contentType,
        status: FileStatus.READY,
      },
    });
    return toFileDto(updated);
  }

  /**
   * `VIEWER` minimum, not `OWNER` — this is a read, so the owner, an `EDITOR`/`VIEWER`
   * grantee, and an anonymous public-link visitor (`userId: null`) can all reach it. See
   * FoldersService.get's identical note; `update`/`delete`/upload stay `OWNER`-only.
   */
  async get(userId: string | null, id: string): Promise<ContractFile> {
    await this.accessControl.requireAccess(userId, 'FILE', id, 'VIEWER');
    return toFileDto(await this.findFileOrThrow(id));
  }

  /** `VIEWER` minimum — see `get`'s doc comment. */
  async downloadUrl(userId: string | null, id: string): Promise<DownloadUrlResult> {
    await this.accessControl.requireAccess(userId, 'FILE', id, 'VIEWER');
    const file = await this.findFileOrThrow(id);
    if (file.status !== FileStatus.READY) {
      throw new BadRequestException('This file is not ready yet.');
    }

    const { url, expiresAt } = await this.storage.getSignedDownloadUrl(
      file.storageKey,
      file.name,
      file.mimeType,
      this.downloadUrlTtlMinutes,
    );
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Rename and/or move — pure database updates, zero storage calls, because
   * `storageKey` never encodes name or folder. See ARCHITECTURE.md §4.
   */
  async update(userId: string, id: string, body: UpdateFileBody): Promise<ContractFile> {
    await this.accessControl.requireAccess(userId, 'FILE', id, 'OWNER');
    const file = await this.findFileOrThrow(id);

    let targetFolderId = file.folderId;
    if (body.folderId !== undefined && body.folderId !== file.folderId) {
      await this.accessControl.requireAccess(userId, 'FOLDER', body.folderId, 'OWNER');
      const targetFolder = await this.findFolderOrThrow(body.folderId);
      if (targetFolder.dataRoomId !== file.dataRoomId) {
        throw new BadRequestException('Cannot move a file to a different Data Room.');
      }
      targetFolderId = targetFolder.id;
    }
    const nextName = body.name ?? file.name;

    try {
      const updated = await this.prisma.file.update({
        where: { id },
        data: { name: nextName, folderId: targetFolderId },
      });
      return toFileDto(updated);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(`A file named "${nextName}" already exists here.`);
      }
      throw error;
    }
  }

  /** Also the client's cancel path for a PENDING upload — see ARCHITECTURE.md §5.
   * Database delete first, then a best-effort blob delete (StorageService never throws
   * on that half — see storage.service.ts), so the user's delete request always
   * succeeds once the row is gone. */
  async delete(userId: string, id: string): Promise<void> {
    await this.accessControl.requireAccess(userId, 'FILE', id, 'OWNER');
    const file = await this.findFileOrThrow(id);

    await this.prisma.file.delete({ where: { id } });
    await this.storage.deleteObject(file.storageKey);
  }

  /**
   * Creates the PENDING row, retrying once if the conflicting name belongs to a stale
   * (abandoned) PENDING upload — see ARCHITECTURE.md §5's "stale-PENDING replacement"
   * decision. A conflict against a fresh PENDING or READY row is a genuine 409.
   */
  private async createPendingFile(
    dataRoomId: string,
    body: CreateUploadUrlBody,
    allowStaleReplace = true,
  ): Promise<PrismaFile> {
    const fileId = randomUUID();
    try {
      return await this.prisma.file.create({
        data: {
          id: fileId,
          name: body.name,
          dataRoomId,
          folderId: body.folderId,
          mimeType: body.mimeType,
          size: 0,
          status: FileStatus.PENDING,
          storageKey: buildStorageKey(dataRoomId, fileId),
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      // Astronomically unlikely to be the storageKey's uniqueness (a UUID collision)
      // rather than (folderId, name) — treated the same way FoldersService.create
      // treats every unique-constraint hit on Folder as a name conflict.
      if (allowStaleReplace && (await this.clearStaleConflict(body.folderId, body.name))) {
        return this.createPendingFile(dataRoomId, body, false);
      }
      throw new ConflictException(`A file named "${body.name}" already exists here.`);
    }
  }

  /**
   * Returns `true` when it's now safe to retry the insert — either a stale PENDING row
   * blocking `name` was found and removed (row, then its blob), or the conflicting row
   * had already disappeared by the time this looked (a genuine race, not this call's
   * concern to resolve further). Returns `false` for a fresh PENDING or READY row: a real
   * 409, not something to paper over.
   */
  private async clearStaleConflict(folderId: string, name: string): Promise<boolean> {
    const existing = await this.prisma.file.findUnique({
      where: { folderId_name: { folderId, name } },
    });
    if (!existing) {
      return true;
    }
    if (existing.status !== FileStatus.PENDING) {
      return false;
    }
    const ageMinutes = (Date.now() - existing.createdAt.getTime()) / 60_000;
    if (ageMinutes < this.pendingTtlMinutes) {
      return false;
    }

    await this.prisma.file.delete({ where: { id: existing.id } });
    await this.storage.deleteObject(existing.storageKey);
    return true;
  }

  private async findFileOrThrow(id: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) {
      // Access was already confirmed a moment ago — this only fires on a genuine race.
      throw new NotFoundException('File not found.');
    }
    return file;
  }

  private async findFolderOrThrow(id: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      throw new NotFoundException('Folder not found.');
    }
    return folder;
  }
}
