import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  CursorPaginationQuerySchema,
  DataRoomSchema,
  ErrorSchema,
  SuccessSchema,
  paginated,
} from './common.js';

const c = initContract();

/** A Data Room in the "list mine" view also carries the caller's relationship to it. */
export const DataRoomListItemSchema = DataRoomSchema.extend({
  access: z.enum(['OWNER', 'VIEWER', 'EDITOR']),
});
export type DataRoomListItem = z.infer<typeof DataRoomListItemSchema>;

export const CreateDataRoomBodySchema = z.object({
  name: z.string().min(1).max(255),
});
export type CreateDataRoomBody = z.infer<typeof CreateDataRoomBodySchema>;

export const UpdateDataRoomBodySchema = z.object({
  name: z.string().min(1).max(255),
});
export type UpdateDataRoomBody = z.infer<typeof UpdateDataRoomBodySchema>;

export const dataRoomsContract = c.router({
  list: {
    method: 'GET',
    path: '/data-rooms',
    query: CursorPaginationQuerySchema,
    responses: {
      200: paginated(DataRoomListItemSchema),
      401: ErrorSchema,
    },
    summary: 'Data Rooms owned by, or shared with, the current user.',
  },
  create: {
    method: 'POST',
    path: '/data-rooms',
    body: CreateDataRoomBodySchema,
    responses: {
      201: DataRoomSchema,
      400: ErrorSchema,
      401: ErrorSchema,
    },
    summary: 'Create a Data Room. Provisions its root folder transactionally.',
  },
  get: {
    method: 'GET',
    path: '/data-rooms/:id',
    responses: {
      200: DataRoomSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Data Room metadata.',
  },
  update: {
    method: 'PATCH',
    path: '/data-rooms/:id',
    body: UpdateDataRoomBodySchema,
    responses: {
      200: DataRoomSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Rename a Data Room.',
  },
  delete: {
    method: 'DELETE',
    path: '/data-rooms/:id',
    body: z.void(),
    responses: {
      200: SuccessSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
    summary: 'Delete a Data Room and everything in it.',
  },
});
