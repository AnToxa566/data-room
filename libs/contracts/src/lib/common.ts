import { z } from 'zod';

/**
 * Shared schemas, composed (never copy-pasted) by every other contract file.
 * See ARCHITECTURE.md §2 — these deliberately stand apart from the Prisma models:
 * `size` is `string` here (BigInt in Postgres), `passwordHash` and `googleId` never
 * appear here at all.
 */

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const DataRoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  rootFolderId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DataRoom = z.infer<typeof DataRoomSchema>;

export const FolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dataRoomId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  path: z.string(),
  depth: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const FileStatusSchema = z.enum(['PENDING', 'READY']);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const FileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dataRoomId: z.string().uuid(),
  folderId: z.string().uuid(),
  // BigInt in Postgres/Prisma. Always a string over the wire — JSON.stringify can't
  // serialize a BigInt, and 2^53 isn't a limit worth inheriting for a document store.
  size: z.string(),
  mimeType: z.string(),
  status: FileStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type File = z.infer<typeof FileSchema>;

export const ShareResourceTypeSchema = z.enum(['DATA_ROOM', 'FOLDER', 'FILE']);
export type ShareResourceType = z.infer<typeof ShareResourceTypeSchema>;

export const ShareRoleSchema = z.enum(['VIEWER', 'EDITOR']);
export type ShareRole = z.infer<typeof ShareRoleSchema>;

export const ShareSchema = z.object({
  id: z.string().uuid(),
  resourceType: ShareResourceTypeSchema,
  resourceId: z.string().uuid(),
  role: ShareRoleSchema,
  linkToken: z.string().nullable(),
  granteeEmail: z.string().email().nullable(),
  granteeUserId: z.string().uuid().nullable(),
  createdById: z.string().uuid(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Share = z.infer<typeof ShareSchema>;

/** One ancestor in a folder's breadcrumb trail, root-first. Derived from `Folder.path`. */
export const BreadcrumbSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type Breadcrumb = z.infer<typeof BreadcrumbSchema>;

/** Shape of every error response, regardless of status code. */
export const ErrorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  error: z.string().optional(),
});
export type Error = z.infer<typeof ErrorSchema>;

/** Generic ack body for endpoints (delete, etc.) that don't return the resource itself. */
export const SuccessSchema = z.object({
  success: z.literal(true),
});
export type Success = z.infer<typeof SuccessSchema>;

/** Cursor pagination query params. Offset pagination is not used anywhere in this API. */
export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

/** Generic cursor-paginated envelope. `nextCursor` is `null` on the last page. */
export function paginated<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
