import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorSchema, FileSchema } from './common.js';

const c = initContract();

/** The type of resource whose share is the caller's "virtual root" for a file they're
 * viewing as a non-owner. `'FILE'` means the share is on the file itself directly — its
 * containing folder is *not* independently accessible to this caller, so the frontend
 * must not fetch it (see `routes/file-route.tsx`). `'FOLDER'`/`'DATA_ROOM'` mean the file
 * was reached by browsing a shared ancestor, so the containing folder is safe to fetch. */
export const SharedFileRootTypeSchema = z.enum(['DATA_ROOM', 'FOLDER', 'FILE']);
export type SharedFileRootType = z.infer<typeof SharedFileRootTypeSchema>;

/** `GET /files/:id`'s response shape — `FileSchema` plus the caller's access context.
 * Deliberately not folded into the base `FileSchema`: that schema is also used by
 * `complete`/`update`, both owner-only, where these fields would always be the same
 * trivial values. */
export const FileWithAccessContextSchema = FileSchema.extend({
  isOwner: z.boolean(),
  sharedByEmail: z.string().email().nullable(),
  sharedRootType: SharedFileRootTypeSchema.nullable(),
});
export type FileWithAccessContext = z.infer<typeof FileWithAccessContextSchema>;

export const CreateUploadUrlBodySchema = z.object({
  folderId: z.string().uuid(),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  // Advisory only — used to reject an oversized upload before it starts. Never
  // persisted: the real size is read back from GCS in `complete`. See ARCHITECTURE.md §5
  // and AGENTS.md's iteration 4 instructions ("metadata comes from GCS, never the
  // client").
  size: z.number().int().nonnegative(),
});
export type CreateUploadUrlBody = z.infer<typeof CreateUploadUrlBodySchema>;

export const CreateUploadUrlResponseSchema = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type CreateUploadUrlResponse = z.infer<
  typeof CreateUploadUrlResponseSchema
>;

export const DownloadUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type DownloadUrlResponse = z.infer<typeof DownloadUrlResponseSchema>;

export const UpdateFileBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    folderId: z.string().uuid().optional(),
  })
  .refine((body) => body.name !== undefined || body.folderId !== undefined, {
    message: 'Provide at least one of "name" or "folderId".',
  });
export type UpdateFileBody = z.infer<typeof UpdateFileBodySchema>;

export const filesContract = c.router({
  createUploadUrl: {
    method: 'POST',
    path: '/files/upload-url',
    body: CreateUploadUrlBodySchema,
    responses: {
      201: CreateUploadUrlResponseSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
      413: ErrorSchema,
    },
    summary: 'Reserve a PENDING File row and get a signed upload URL.',
  },
  complete: {
    method: 'POST',
    path: '/files/:id/complete',
    // No body — metadata (size, contentType) is read back from GCS, never accepted from
    // the client. See ARCHITECTURE.md §5.
    body: z.void(),
    responses: {
      200: FileSchema,
      // Not PENDING (already completed, or the object isn't in GCS yet).
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Confirm the upload landed in storage. PENDING -> READY.',
  },
  get: {
    method: 'GET',
    path: '/files/:id',
    responses: {
      200: FileWithAccessContextSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'File metadata, plus the caller\'s access context.',
  },
  downloadUrl: {
    method: 'GET',
    path: '/files/:id/download-url',
    responses: {
      200: DownloadUrlResponseSchema,
      // File isn't READY yet.
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Signed, time-limited URL to view the file in the browser (inline).',
  },
  update: {
    method: 'PATCH',
    path: '/files/:id',
    body: UpdateFileBodySchema,
    responses: {
      200: FileSchema,
      // Move target is in a different Data Room.
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
    },
    summary: 'Rename and/or move a file. Never touches storage.',
  },
  delete: {
    method: 'DELETE',
    path: '/files/:id',
    body: z.void(),
    responses: {
      // No body — also the cancel path for a PENDING upload. See
      // auth.ts's `logout` for the identical 204/z.void() pattern.
      204: z.void(),
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Delete a file (or cancel a PENDING upload).',
  },
});
