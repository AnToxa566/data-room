import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  BreadcrumbSchema,
  CursorPaginationQuerySchema,
  ErrorSchema,
  FileSchema,
  FolderSchema,
  SuccessSchema,
  paginated,
} from './common.js';

const c = initContract();

export const FolderWithBreadcrumbsSchema = FolderSchema.extend({
  breadcrumbs: z.array(BreadcrumbSchema),
});
export type FolderWithBreadcrumbs = z.infer<typeof FolderWithBreadcrumbsSchema>;

/**
 * One row in a folder's children listing — a folder or a file, tagged with a
 * discriminator so the UI can render both in a single ordered list.
 */
export const FolderChildSchema = FolderSchema.extend({
  type: z.literal('folder'),
});
export const FileChildSchema = FileSchema.extend({ type: z.literal('file') });
export const FolderChildItemSchema = z.discriminatedUnion('type', [
  FolderChildSchema,
  FileChildSchema,
]);
export type FolderChildItem = z.infer<typeof FolderChildItemSchema>;

export const FolderStatsSchema = z.object({
  // Aggregate of File.size (BigInt) over the subtree — same wire rule as File.size.
  totalSize: z.string(),
  fileCount: z.number().int().nonnegative(),
  folderCount: z.number().int().nonnegative(),
});
export type FolderStats = z.infer<typeof FolderStatsSchema>;

export const CreateFolderBodySchema = z.object({
  dataRoomId: z.string().uuid(),
  // Always required here — the root folder is created only inside the Data Room
  // creation transaction, never through this endpoint.
  parentId: z.string().uuid(),
  name: z.string().min(1).max(255),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBodySchema>;

export const UpdateFolderBodySchema = z.object({
  name: z.string().min(1).max(255),
});
export type UpdateFolderBody = z.infer<typeof UpdateFolderBodySchema>;

export const foldersContract = c.router({
  create: {
    method: 'POST',
    path: '/folders',
    body: CreateFolderBodySchema,
    responses: {
      201: FolderSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
    },
    summary: 'Create a subfolder.',
  },
  get: {
    method: 'GET',
    path: '/folders/:id',
    responses: {
      200: FolderWithBreadcrumbsSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Folder metadata plus its breadcrumb trail.',
  },
  children: {
    method: 'GET',
    path: '/folders/:id/children',
    query: CursorPaginationQuerySchema,
    responses: {
      200: paginated(FolderChildItemSchema),
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary:
      'Subfolders and files directly inside this folder, one ordered list.',
  },
  stats: {
    method: 'GET',
    path: '/folders/:id/stats',
    responses: {
      200: FolderStatsSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Aggregate size, file count, and folder count over the subtree.',
  },
  update: {
    method: 'PATCH',
    path: '/folders/:id',
    body: UpdateFolderBodySchema,
    responses: {
      200: FolderSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
    },
    summary: 'Rename a folder.',
  },
  delete: {
    method: 'DELETE',
    path: '/folders/:id',
    body: z.void(),
    responses: {
      200: SuccessSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Delete a folder and its entire subtree.',
  },
});
