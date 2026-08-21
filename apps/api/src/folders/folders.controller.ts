import { Controller, UseGuards } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { FoldersService } from './folders.service.js';

/**
 * Implements `contract.folders` via `@ts-rest/nest`'s `TsRestHandler` — split across two
 * handler methods, not one, because `get`/`children`/`stats` support an anonymous caller
 * (a public-link visitor, see ARCHITECTURE.md §4) and `create`/`update`/`delete` don't.
 * `TsRestHandler` accepts a single route as readily as a whole sub-router, so binding a
 * subset of `contract.folders` to each method is the supported shape, not a workaround —
 * see AccessControlService's iteration-5 notes for why the anonymous path is safe by
 * construction (`resolveAccess`/`requireAccess` already deny a `null` caller with no
 * matching public share).
 */
@Controller()
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @TsRestHandler({
    create: contract.folders.create,
    update: contract.folders.update,
    delete: contract.folders.delete,
  })
  mutate(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(
      {
        create: contract.folders.create,
        update: contract.folders.update,
        delete: contract.folders.delete,
      },
      {
        create: async ({ body }) => ({
          status: 201,
          body: await this.foldersService.create(user.id, body),
        }),
        update: async ({ params, body }) => ({
          status: 200,
          body: await this.foldersService.update(user.id, params.id, body),
        }),
        delete: async ({ params }) => {
          await this.foldersService.delete(user.id, params.id);
          return { status: 200, body: { success: true } };
        },
      },
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @TsRestHandler(contract.folders.get)
  get(@OptionalCurrentUser() user: AuthenticatedUser | null) {
    return tsRestHandler(contract.folders.get, async ({ params }) => ({
      status: 200,
      body: await this.foldersService.get(user?.id ?? null, params.id),
    }));
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @TsRestHandler(contract.folders.children)
  children(@OptionalCurrentUser() user: AuthenticatedUser | null) {
    return tsRestHandler(contract.folders.children, async ({ params, query }) => ({
      status: 200,
      body: await this.foldersService.children(user?.id ?? null, params.id, query),
    }));
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @TsRestHandler(contract.folders.stats)
  stats(@OptionalCurrentUser() user: AuthenticatedUser | null) {
    return tsRestHandler(contract.folders.stats, async ({ params }) => ({
      status: 200,
      body: await this.foldersService.stats(user?.id ?? null, params.id),
    }));
  }
}
