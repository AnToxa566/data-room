import { Controller } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { FoldersService } from './folders.service.js';

/** Implements `contract.folders` via `@ts-rest/nest`'s `TsRestHandler` — see
 * DataRoomsController and auth-contract.controller.ts for the identical pattern. */
@Controller()
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @TsRestHandler(contract.folders)
  handler(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(contract.folders, {
      create: async ({ body }) => ({
        status: 201,
        body: await this.foldersService.create(user.id, body),
      }),
      get: async ({ params }) => ({
        status: 200,
        body: await this.foldersService.get(user.id, params.id),
      }),
      children: async ({ params, query }) => ({
        status: 200,
        body: await this.foldersService.children(user.id, params.id, query),
      }),
      stats: async ({ params }) => ({
        status: 200,
        body: await this.foldersService.stats(user.id, params.id),
      }),
      update: async ({ params, body }) => ({
        status: 200,
        body: await this.foldersService.update(user.id, params.id, body),
      }),
      delete: async ({ params }) => {
        await this.foldersService.delete(user.id, params.id);
        return { status: 200, body: { success: true } };
      },
    });
  }
}
