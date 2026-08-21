import { Controller, UseGuards } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { DataRoomsService } from './data-rooms.service.js';

/**
 * Implements `contract.dataRooms` via `@ts-rest/nest`'s `TsRestHandler` — split across
 * two handler methods, not one, because `get` supports an anonymous caller (a
 * public-link visitor, see ARCHITECTURE.md §4) and `list`/`create`/`update`/`delete`
 * don't (there is no meaningful anonymous "list my Data Rooms"). See FoldersController
 * for the identical pattern and rationale.
 */
@Controller()
export class DataRoomsController {
  constructor(private readonly dataRoomsService: DataRoomsService) {}

  @TsRestHandler({
    create: contract.dataRooms.create,
    list: contract.dataRooms.list,
    update: contract.dataRooms.update,
    delete: contract.dataRooms.delete,
  })
  mutate(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(
      {
        create: contract.dataRooms.create,
        list: contract.dataRooms.list,
        update: contract.dataRooms.update,
        delete: contract.dataRooms.delete,
      },
      {
        create: async ({ body }) => ({
          status: 201,
          body: await this.dataRoomsService.create(user.id, body),
        }),
        list: async ({ query }) => ({
          status: 200,
          body: await this.dataRoomsService.list(user.id, query),
        }),
        update: async ({ params, body }) => ({
          status: 200,
          body: await this.dataRoomsService.update(user.id, params.id, body),
        }),
        delete: async ({ params }) => {
          await this.dataRoomsService.delete(user.id, params.id);
          return { status: 200, body: { success: true } };
        },
      },
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @TsRestHandler(contract.dataRooms.get)
  get(@OptionalCurrentUser() user: AuthenticatedUser | null) {
    return tsRestHandler(contract.dataRooms.get, async ({ params }) => ({
      status: 200,
      body: await this.dataRoomsService.get(user?.id ?? null, params.id),
    }));
  }
}
