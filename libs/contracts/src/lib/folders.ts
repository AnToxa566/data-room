import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  BreadcrumbSchema,
  CursorPaginationQuerySchema,
  ErrorSchema,
  FolderSchema,
  SuccessSchema,
  paginated,
} from './common.js';

const c = initContract();

/** The type of resource whose share is the caller's "virtual root" for a folder they're
 * viewing as a non-owner — never `'FOLDER'`-shared-as-`'FILE'` (a folder's share
 * candidates can never include a FILE-type share, see AccessControlService). */
export const SharedRootTypeSchema = z.enum(['DATA_ROOM', 'FOLDER']);
export type SharedRootType = z.infer<typeof SharedRootTypeSchema>;

export const FolderWithBreadcrumbsSchema = FolderSchema.extend({
  breadcrumbs: z.array(BreadcrumbSchema),
  // Whether this folder is the root of its Data Room — the root can't be renamed,
  // moved, or deleted independently, and the UI needs to know that without a second
  // request. See ARCHITECTURE.md §4.
  isRoot: z.boolean(),
  // The owning Data Room's display name — substitutes for the root folder's own `name`
  // column (a fixed '/' placeholder, see ARCHITECTURE.md §4) wherever that placeholder
  // would otherwise be shown. Present for every caller (owner included) so the frontend
  // never needs a separate, owner-only `GET /data-rooms` lookup just to resolve a name.
  dataRoomName: z.string(),
  // Whether the current caller owns the Data Room this folder belongs to. `false` for a
  // share recipient (signed in or anonymous) — see AccessControlService.resolveShareContext.
  isOwner: z.boolean(),
  // Who created the share granting a non-owner caller access — null iff isOwner.
  sharedByEmail: z.string().email().nullable(),
  // The widest matching share's resource type — the caller's "virtual root", per
  // ARCHITECTURE.md §4 ("Shared subtrees are scoped... the shared resource becomes their
  // virtual root"). `breadcrumbs` is already truncated to start there. Null iff isOwner.
  sharedRootType: SharedRootTypeSchema.nullable(),
});
export type FolderWithBreadcrumbs = z.infer<typeof FolderWithBreadcrumbsSchema>;

/**
 * One row in a folder's children listing — a folder or a file, tagged with a `kind`
 * discriminator so the UI can render both in a single ordered list. Deliberately a
 * narrower shape than `FolderSchema`/`FileSchema` (no `path`, `dataRoomId`, `status`,
 * etc.) — a listing row is not the same contract as "fetch this one resource".
 */
export const FolderChildSchema = z.object({
  kind: z.literal('folder'),
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const FileChildSchema = z.object({
  kind: z.literal('file'),
  id: z.string().uuid(),
  name: z.string(),
  size: z.string(),
  mimeType: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FileChildItem = z.infer<typeof FileChildSchema>;
export const FolderChildItemSchema = z.discriminatedUnion('kind', [
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
      400: ErrorSchema,
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
      // The target is a root folder — it can only be deleted with its Data Room.
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Delete a folder and its entire subtree.',
  },
});
