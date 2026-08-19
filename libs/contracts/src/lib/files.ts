import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorSchema, FileSchema, SuccessSchema } from './common.js';

const c = initContract();

export const CreateUploadUrlBodySchema = z.object({
  dataRoomId: z.string().uuid(),
  folderId: z.string().uuid(),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1),
});
export type CreateUploadUrlBody = z.infer<typeof CreateUploadUrlBodySchema>;

export const CreateUploadUrlResponseSchema = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
});
export type CreateUploadUrlResponse = z.infer<
  typeof CreateUploadUrlResponseSchema
>;

export const CompleteUploadBodySchema = z.object({
  // Reported by the browser after the PUT to storage completes — may differ from what
  // was declared at reservation time (e.g. the browser's sniffed mimeType).
  size: z.string(),
  mimeType: z.string().min(1),
});
export type CompleteUploadBody = z.infer<typeof CompleteUploadBodySchema>;

export const DownloadUrlResponseSchema = z.object({
  downloadUrl: z.string().url(),
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
    },
    summary: 'Reserve a PENDING File row and get a signed upload URL.',
  },
  complete: {
    method: 'POST',
    path: '/files/:id/complete',
    body: CompleteUploadBodySchema,
    responses: {
      200: FileSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
    },
    summary: 'Confirm the upload landed in storage. PENDING -> READY.',
  },
  get: {
    method: 'GET',
    path: '/files/:id',
    responses: {
      200: FileSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'File metadata.',
  },
  downloadUrl: {
    method: 'GET',
    path: '/files/:id/download-url',
    responses: {
      200: DownloadUrlResponseSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Signed, time-limited URL to read the file from storage.',
  },
  update: {
    method: 'PATCH',
    path: '/files/:id',
    body: UpdateFileBodySchema,
    responses: {
      200: FileSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
    },
    summary: 'Rename and/or move a file.',
  },
  delete: {
    method: 'DELETE',
    path: '/files/:id',
    body: z.void(),
    responses: {
      200: SuccessSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Delete a file.',
  },
});
