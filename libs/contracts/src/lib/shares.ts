import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ErrorSchema,
  ShareResourceTypeSchema,
  ShareRoleSchema,
  ShareSchema,
  paginated,
} from './common.js';

const c = initContract();

const ShareCreateBaseSchema = z.object({
  resourceType: ShareResourceTypeSchema,
  resourceId: z.string().uuid(),
  role: ShareRoleSchema.default('VIEWER'),
  expiresAt: z.string().datetime().nullable().optional(),
});

/** Public link — no grantee is recorded. */
export const ShareCreatePublicBodySchema = ShareCreateBaseSchema.extend({
  mode: z.literal('public'),
});

/** Direct grant by email — invalid to submit without a `granteeEmail`. */
export const ShareCreateEmailBodySchema = ShareCreateBaseSchema.extend({
  mode: z.literal('email'),
  granteeEmail: z.string().email(),
});

/**
 * Exactly one access mode per share, enforced by the schema itself: `mode: 'public'`
 * cannot carry a `granteeEmail`, and `mode: 'email'` cannot omit one.
 */
export const CreateShareBodySchema = z.discriminatedUnion('mode', [
  ShareCreatePublicBodySchema,
  ShareCreateEmailBodySchema,
]);
export type CreateShareBody = z.infer<typeof CreateShareBodySchema>;

export const ListSharesQuerySchema = z.object({
  resourceType: ShareResourceTypeSchema,
  resourceId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListSharesQuery = z.infer<typeof ListSharesQuerySchema>;

export const sharesContract = c.router({
  create: {
    method: 'POST',
    path: '/shares',
    body: CreateShareBodySchema,
    responses: {
      201: ShareSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
    },
    summary:
      'Create a public-link or direct-grant share on a Data Room, folder, or file.',
  },
  list: {
    method: 'GET',
    path: '/shares',
    query: ListSharesQuerySchema,
    responses: {
      200: paginated(ShareSchema),
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Shares on a specific resource.',
  },
  revoke: {
    method: 'DELETE',
    path: '/shares/:id',
    body: z.void(),
    responses: {
      // Soft delete — returns the share with `revokedAt` set, not a bare ack, so the
      // UI can say "revoked at ..." rather than treat it as gone.
      200: ShareSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Revoke a share (soft — sets revokedAt).',
  },
  resolveByToken: {
    method: 'GET',
    path: '/shares/by-token/:token',
    responses: {
      200: ShareSchema,
      // Not found, expired, and revoked all collapse into 404 — a public link never
      // reveals which case it is. See ARCHITECTURE.md §7.
      404: ErrorSchema,
    },
    summary: 'Resolve a public share link by its token.',
  },
});
