import { Controller } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { DataRoomsService } from './data-rooms.service.js';

/**
 * Implements `contract.dataRooms` via `@ts-rest/nest`'s `TsRestHandler` — the current
 * (non-deprecated) integration API; see auth-contract.controller.ts for the identical
 * pattern and why `@Res()` is avoided. Every route here requires a session: no
 * `@Public()`, so the global `JwtAuthGuard` covers all of them.
 */
@Controller()
export class DataRoomsController {
  constructor(private readonly dataRoomsService: DataRoomsService) {}

  @TsRestHandler(contract.dataRooms)
  handler(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(contract.dataRooms, {
      create: async ({ body }) => ({
        status: 201,
        body: await this.dataRoomsService.create(user.id, body),
      }),
      list: async ({ query }) => ({
        status: 200,
        body: await this.dataRoomsService.list(user.id, query),
      }),
      get: async ({ params }) => ({
        status: 200,
        body: await this.dataRoomsService.get(user.id, params.id),
      }),
      update: async ({ params, body }) => ({
        status: 200,
        body: await this.dataRoomsService.update(user.id, params.id, body),
      }),
      delete: async ({ params }) => {
        await this.dataRoomsService.delete(user.id, params.id);
        return { status: 200, body: { success: true } };
      },
    });
  }
}
